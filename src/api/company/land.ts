import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { prisma } from "../../db";
import { hasPermission } from "./utils";

export const landRoutes = new Elysia()
  // GET /:id/land - Get all lands for a company
  .get("/:id/land", async ({ request, params, set }) => {
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

    const canViewLand = await hasPermission(session.user.id, params.id, "land:view");
    if (!canViewLand) {
      set.status = 403;
      return { error: "You don't have permission to view lands" };
    }

    const lands = await prisma.land.findMany({
      where: { companyId: params.id },
      orderBy: { recordedAt: "desc" },
    });

    return { lands };
  })

  // GET /:id/land/:landId - Get specific land
  .get("/:id/land/:landId", async ({ request, params, set }) => {
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

    const canViewLand = await hasPermission(session.user.id, params.id, "land:view");
    if (!canViewLand) {
      set.status = 403;
      return { error: "You don't have permission to view lands" };
    }

    const land = await prisma.land.findFirst({
      where: { 
        id: params.landId, 
        companyId: params.id 
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!land) {
      set.status = 404;
      return { error: "Land not found" };
    }

    return { land };
  })

  // POST /:id/land - Create new land
  .post(
    "/:id/land",
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

      const canCreateLand = await hasPermission(session.user.id, params.id, "land:create");
      if (!canCreateLand) {
        set.status = 403;
        return { error: "You don't have permission to create lands" };
      }

      const { name, areaHectares, latitude, longitude, location, geoPolygon, isDeforestationFree } = body as {
        name: string;
        areaHectares: number;
        latitude: number;
        longitude: number;
        location: string;
        geoPolygon: string;
        isDeforestationFree?: boolean;
      };

      if (!name || name.trim().length === 0) {
        set.status = 400;
        return { error: "Name is required" };
      }

      if (typeof areaHectares !== "number" || areaHectares <= 0) {
        set.status = 400;
        return { error: "Area in hectares must be a positive number" };
      }

      if (typeof latitude !== "number" || latitude < -90 || latitude > 90) {
        set.status = 400;
        return { error: "Latitude must be between -90 and 90" };
      }

      if (typeof longitude !== "number" || longitude < -180 || longitude > 180) {
        set.status = 400;
        return { error: "Longitude must be between -180 and 180" };
      }

      if (!location || location.trim().length === 0) {
        set.status = 400;
        return { error: "Location is required" };
      }

      if (!geoPolygon || geoPolygon.trim().length === 0) {
        set.status = 400;
        return { error: "GeoPolygon is required" };
      }

      const land = await prisma.land.create({
        data: {
          companyId: params.id,
          name: name.trim(),
          areaHectares,
          latitude,
          longitude,
          location: location.trim(),
          geoPolygon: geoPolygon.trim(),
          isDeforestationFree: isDeforestationFree ?? null,
        },
      });

      return { land };
    },
    {
      body: t.Object({
        name: t.String(),
        areaHectares: t.Number(),
        latitude: t.Number(),
        longitude: t.Number(),
        location: t.String(),
        geoPolygon: t.String(),
        isDeforestationFree: t.Optional(t.Boolean()),
      }),
    }
  )

  // PUT /:id/land/:landId - Update land
  .put(
    "/:id/land/:landId",
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

      const canUpdateLand = await hasPermission(session.user.id, params.id, "land:update");
      if (!canUpdateLand) {
        set.status = 403;
        return { error: "You don't have permission to update lands" };
      }

      const existingLand = await prisma.land.findFirst({
        where: { 
          id: params.landId, 
          companyId: params.id 
        },
      });

      if (!existingLand) {
        set.status = 404;
        return { error: "Land not found" };
      }

      const { name, areaHectares, latitude, longitude, location, geoPolygon, isDeforestationFree } = body as {
        name?: string;
        areaHectares?: number;
        latitude?: number;
        longitude?: number;
        location?: string;
        geoPolygon?: string;
        isDeforestationFree?: boolean;
      };

      const updateData: any = {};

      if (name !== undefined) {
        if (name.trim().length === 0) {
          set.status = 400;
          return { error: "Name cannot be empty" };
        }
        updateData.name = name.trim();
      }

      if (areaHectares !== undefined) {
        if (typeof areaHectares !== "number" || areaHectares <= 0) {
          set.status = 400;
          return { error: "Area in hectares must be a positive number" };
        }
        updateData.areaHectares = areaHectares;
      }

      if (latitude !== undefined) {
        if (typeof latitude !== "number" || latitude < -90 || latitude > 90) {
          set.status = 400;
          return { error: "Latitude must be between -90 and 90" };
        }
        updateData.latitude = latitude;
      }

      if (longitude !== undefined) {
        if (typeof longitude !== "number" || longitude < -180 || longitude > 180) {
          set.status = 400;
          return { error: "Longitude must be between -180 and 180" };
        }
        updateData.longitude = longitude;
      }

      if (location !== undefined) {
        if (location.trim().length === 0) {
          set.status = 400;
          return { error: "Location cannot be empty" };
        }
        updateData.location = location.trim();
      }

      if (geoPolygon !== undefined) {
        if (geoPolygon.trim().length === 0) {
          set.status = 400;
          return { error: "GeoPolygon cannot be empty" };
        }
        updateData.geoPolygon = geoPolygon.trim();
      }

      if (isDeforestationFree !== undefined) {
        updateData.isDeforestationFree = isDeforestationFree ?? null;
      }

      const land = await prisma.land.update({
        where: { id: params.landId },
        data: updateData,
      });

      return { land };
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        areaHectares: t.Optional(t.Number()),
        latitude: t.Optional(t.Number()),
        longitude: t.Optional(t.Number()),
        location: t.Optional(t.String()),
        geoPolygon: t.Optional(t.String()),
        isDeforestationFree: t.Optional(t.Boolean()),
      }),
    }
  )

  // DELETE /:id/land/:landId - Delete land
  .delete("/:id/land/:landId", async ({ request, params, set }) => {
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

    const canDeleteLand = await hasPermission(session.user.id, params.id, "land:delete");
    if (!canDeleteLand) {
      set.status = 403;
      return { error: "You don't have permission to delete lands" };
    }

    const land = await prisma.land.findFirst({
      where: { 
        id: params.landId, 
        companyId: params.id 
      },
    });

    if (!land) {
      set.status = 404;
      return { error: "Land not found" };
    }

    await prisma.land.delete({
      where: { id: params.landId },
    });

    return { success: true, message: "Land deleted successfully" };
  });

