import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { prisma } from "../../db";
import { hasPermission } from "./utils";

export const commodityRoutes = new Elysia()
  // GET /:id/commodity - Get all commodities
  .get("/:id/commodity", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canView = await hasPermission(session.user.id, params.id, "commodity:view");
    if (!canView) {
      set.status = 403;
      return { error: "You don't have permission to view commodities" };
    }

    const commodities = await prisma.commodity.findMany({
      include: {
        batches: {
          select: {
            id: true,
            lotCode: true,
            harvestDate: true,
            totalKg: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { commodities };
  })

  // GET /:id/commodity/:commodityId - Get specific commodity
  .get("/:id/commodity/:commodityId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canView = await hasPermission(session.user.id, params.id, "commodity:view");
    if (!canView) {
      set.status = 403;
      return { error: "You don't have permission to view commodities" };
    }

    const commodity = await prisma.commodity.findUnique({
      where: { id: params.commodityId },
      include: {
        batches: {
          include: {
            batchSources: {
              include: {
                farmerGroup: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                land: {
                  select: {
                    id: true,
                    name: true,
                    location: true,
                  },
                },
              },
            },
            batchAttributes: {
              select: {
                id: true,
                key: true,
                value: true,
                unit: true,
                recordedAt: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!commodity) {
      set.status = 404;
      return { error: "Commodity not found" };
    }

    return { commodity };
  })

  // POST /:id/commodity - Create new commodity
  .post(
    "/:id/commodity",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: params.id },
      });

      if (!userCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      const canCreate = await hasPermission(session.user.id, params.id, "commodity:create");
      if (!canCreate) {
        set.status = 403;
        return { error: "You don't have permission to create commodities" };
      }

      const { name, code } = body as {
        name: string;
        code: string;
      };

      if (!name || name.trim().length === 0) {
        set.status = 400;
        return { error: "Name is required" };
      }

      if (!code || code.trim().length === 0) {
        set.status = 400;
        return { error: "Code is required" };
      }

      try {
        const commodity = await prisma.commodity.create({
          data: {
            name: name.trim(),
            code: code.trim(),
          },
          include: {
            batches: {
              select: {
                id: true,
                lotCode: true,
                harvestDate: true,
                totalKg: true,
              },
            },
          },
        });

        return { commodity };
      } catch (error: any) {
        if (error.code === "P2002") {
          set.status = 409;
          return { error: "Commodity code already exists" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        code: t.String({ minLength: 1 }),
      }),
    }
  )

  // PUT /:id/commodity/:commodityId - Update commodity
  .put(
    "/:id/commodity/:commodityId",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: params.id },
      });

      if (!userCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      const canUpdate = await hasPermission(session.user.id, params.id, "commodity:update");
      if (!canUpdate) {
        set.status = 403;
        return { error: "You don't have permission to update commodities" };
      }

      const existingCommodity = await prisma.commodity.findUnique({
        where: { id: params.commodityId },
      });

      if (!existingCommodity) {
        set.status = 404;
        return { error: "Commodity not found" };
      }

      const { name, code } = body as {
        name?: string;
        code?: string;
      };

      const updateData: any = {};

      if (name !== undefined) {
        if (name.trim().length === 0) {
          set.status = 400;
          return { error: "Name cannot be empty" };
        }
        updateData.name = name.trim();
      }

      if (code !== undefined) {
        if (code.trim().length === 0) {
          set.status = 400;
          return { error: "Code cannot be empty" };
        }
        updateData.code = code.trim();
      }

      try {
        const commodity = await prisma.commodity.update({
          where: { id: params.commodityId },
          data: updateData,
          include: {
            batches: {
              select: {
                id: true,
                lotCode: true,
                harvestDate: true,
                totalKg: true,
              },
            },
          },
        });

        return { commodity };
      } catch (error: any) {
        if (error.code === "P2002") {
          set.status = 409;
          return { error: "Commodity code already exists" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        code: t.Optional(t.String({ minLength: 1 })),
      }),
    }
  )

  // DELETE /:id/commodity/:commodityId - Delete commodity
  .delete("/:id/commodity/:commodityId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canDelete = await hasPermission(session.user.id, params.id, "commodity:delete");
    if (!canDelete) {
      set.status = 403;
      return { error: "You don't have permission to delete commodities" };
    }

    const existingCommodity = await prisma.commodity.findUnique({
      where: { id: params.commodityId },
      include: {
        batches: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!existingCommodity) {
      set.status = 404;
      return { error: "Commodity not found" };
    }

    // Check if commodity has batches
    if (existingCommodity.batches.length > 0) {
      set.status = 400;
      return { error: "Cannot delete commodity with existing batches" };
    }

    await prisma.commodity.delete({
      where: { id: params.commodityId },
    });

    return { success: true, message: "Commodity deleted successfully" };
  });

