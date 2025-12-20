import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { prisma } from "../../db";
import { hasPermission } from "./utils";

export const workerRoutes = new Elysia()
  // ========== FARMER (INDIVIDUAL) ROUTES ==========
  
  // GET /:id/worker/individual - Get all farmers for a company
  .get("/:id/worker/individual", async ({ request, params, set }) => {
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

    const canView = await hasPermission(session.user.id, params.id, "member:user:view");
    if (!canView) {
      set.status = 403;
      return { error: "You don't have permission to view farmers" };
    }

    const farmers = await prisma.farmer.findMany({
      where: { companyId: params.id },
      include: {
        farmerGroups: {
          include: {
            farmerGroup: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Transform data to match frontend expectations
    const transformedFarmers = farmers.map(farmer => ({
      ...farmer,
      farmerGroups: farmer.farmerGroups.map(fgf => fgf.farmerGroup),
    }));

    return { farmers: transformedFarmers };
  })

  // GET /:id/worker/individual/:farmerId - Get specific farmer
  .get("/:id/worker/individual/:farmerId", async ({ request, params, set }) => {
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

    const canView = await hasPermission(session.user.id, params.id, "member:user:view");
    if (!canView) {
      set.status = 403;
      return { error: "You don't have permission to view farmers" };
    }

    const farmer = await prisma.farmer.findFirst({
      where: { 
        id: params.farmerId, 
        companyId: params.id 
      },
      include: {
        farmerGroups: {
          include: {
            farmerGroup: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!farmer) {
      set.status = 404;
      return { error: "Farmer not found" };
    }

    // Transform data to match frontend expectations
    const transformedFarmer = {
      ...farmer,
      farmerGroups: farmer.farmerGroups.map(fgf => fgf.farmerGroup),
    };

    return { farmer: transformedFarmer };
  })

  // POST /:id/worker/individual - Create new farmer
  .post(
    "/:id/worker/individual",
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

      const canCreate = await hasPermission(session.user.id, params.id, "member:user:create");
      if (!canCreate) {
        set.status = 403;
        return { error: "You don't have permission to create farmers" };
      }

      const { firstName, lastName, nationalId, phoneNumber, address, farmerGroupIds } = body as {
        firstName: string;
        lastName: string;
        nationalId: string;
        phoneNumber: string;
        address: string;
        farmerGroupIds?: string[];
      };

      if (!firstName || firstName.trim().length === 0) {
        set.status = 400;
        return { error: "First name is required" };
      }

      if (!lastName || lastName.trim().length === 0) {
        set.status = 400;
        return { error: "Last name is required" };
      }

      if (!nationalId || nationalId.trim().length === 0) {
        set.status = 400;
        return { error: "National ID is required" };
      }

      if (!phoneNumber || phoneNumber.trim().length === 0) {
        set.status = 400;
        return { error: "Phone number is required" };
      }

      if (!address || address.trim().length === 0) {
        set.status = 400;
        return { error: "Address is required" };
      }

      // Check if farmerGroupIds exist and belong to the same company (if provided)
      if (farmerGroupIds && farmerGroupIds.length > 0) {
        const farmerGroups = await prisma.farmerGroup.findMany({
          where: { 
            id: { in: farmerGroupIds },
            companyId: params.id 
          },
        });

        if (farmerGroups.length !== farmerGroupIds.length) {
          set.status = 400;
          return { error: "One or more farmer groups not found or don't belong to this company" };
        }
      }

      // Check if nationalId already exists
      const existingFarmer = await prisma.farmer.findUnique({
        where: { nationalId: nationalId.trim() },
      });

      if (existingFarmer) {
        set.status = 400;
        return { error: "Farmer with this national ID already exists" };
      }

      const farmer = await prisma.farmer.create({
        data: {
          companyId: params.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          nationalId: nationalId.trim(),
          phoneNumber: phoneNumber.trim(),
          address: address.trim(),
          farmerGroups: farmerGroupIds && farmerGroupIds.length > 0 ? {
            create: farmerGroupIds.map(groupId => ({
              farmerGroupId: groupId,
            })),
          } : undefined,
        },
        include: {
          farmerGroups: {
            include: {
              farmerGroup: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      // Transform data to match frontend expectations
      const transformedFarmer = {
        ...farmer,
        farmerGroups: farmer.farmerGroups.map(fgf => fgf.farmerGroup),
      };

      return { farmer: transformedFarmer };
    },
    {
      body: t.Object({
        firstName: t.String(),
        lastName: t.String(),
        nationalId: t.String(),
        phoneNumber: t.String(),
        address: t.String(),
        farmerGroupIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // PUT /:id/worker/individual/:farmerId - Update farmer
  .put(
    "/:id/worker/individual/:farmerId",
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

      const canUpdate = await hasPermission(session.user.id, params.id, "member:user:update");
      if (!canUpdate) {
        set.status = 403;
        return { error: "You don't have permission to update farmers" };
      }

      const existingFarmer = await prisma.farmer.findFirst({
        where: { 
          id: params.farmerId, 
          companyId: params.id 
        },
      });

      if (!existingFarmer) {
        set.status = 404;
        return { error: "Farmer not found" };
      }

      const { firstName, lastName, nationalId, phoneNumber, address, farmerGroupIds } = body as {
        firstName?: string;
        lastName?: string;
        nationalId?: string;
        phoneNumber?: string;
        address?: string;
        farmerGroupIds?: string[];
      };

      const updateData: any = {};

      if (firstName !== undefined) {
        if (firstName.trim().length === 0) {
          set.status = 400;
          return { error: "First name cannot be empty" };
        }
        updateData.firstName = firstName.trim();
      }

      if (lastName !== undefined) {
        if (lastName.trim().length === 0) {
          set.status = 400;
          return { error: "Last name cannot be empty" };
        }
        updateData.lastName = lastName.trim();
      }

      if (nationalId !== undefined) {
        if (nationalId.trim().length === 0) {
          set.status = 400;
          return { error: "National ID cannot be empty" };
        }
        
        // Check if nationalId already exists (excluding current farmer)
        const existingNationalId = await prisma.farmer.findFirst({
          where: { 
            nationalId: nationalId.trim(),
            id: { not: params.farmerId }
          },
        });

        if (existingNationalId) {
          set.status = 400;
          return { error: "Farmer with this national ID already exists" };
        }
        
        updateData.nationalId = nationalId.trim();
      }

      if (phoneNumber !== undefined) {
        if (phoneNumber.trim().length === 0) {
          set.status = 400;
          return { error: "Phone number cannot be empty" };
        }
        updateData.phoneNumber = phoneNumber.trim();
      }

      if (address !== undefined) {
        if (address.trim().length === 0) {
          set.status = 400;
          return { error: "Address cannot be empty" };
        }
        updateData.address = address.trim();
      }

      if (farmerGroupIds !== undefined) {
        // Check if all farmerGroupIds exist and belong to the same company
        if (farmerGroupIds.length > 0) {
          const farmerGroups = await prisma.farmerGroup.findMany({
            where: { 
              id: { in: farmerGroupIds },
              companyId: params.id 
            },
          });

          if (farmerGroups.length !== farmerGroupIds.length) {
            set.status = 400;
            return { error: "One or more farmer groups not found or don't belong to this company" };
          }
        }

        // Update farmer groups relationship
        // First, delete all existing relationships
        await prisma.farmerGroupFarmer.deleteMany({
          where: { farmerId: params.farmerId },
        });

        // Then, create new relationships
        if (farmerGroupIds.length > 0) {
          updateData.farmerGroups = {
            create: farmerGroupIds.map(groupId => ({
              farmerGroupId: groupId,
            })),
          };
        }
      }

      const farmer = await prisma.farmer.update({
        where: { id: params.farmerId },
        data: updateData,
        include: {
          farmerGroups: {
            include: {
              farmerGroup: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      // Transform data to match frontend expectations
      const transformedFarmer = {
        ...farmer,
        farmerGroups: farmer.farmerGroups.map(fgf => fgf.farmerGroup),
      };

      return { farmer: transformedFarmer };
    },
    {
      body: t.Object({
        firstName: t.Optional(t.String()),
        lastName: t.Optional(t.String()),
        nationalId: t.Optional(t.String()),
        phoneNumber: t.Optional(t.String()),
        address: t.Optional(t.String()),
        farmerGroupIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // DELETE /:id/worker/individual/:farmerId - Delete farmer
  .delete("/:id/worker/individual/:farmerId", async ({ request, params, set }) => {
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

    const canDelete = await hasPermission(session.user.id, params.id, "member:user:delete");
    if (!canDelete) {
      set.status = 403;
      return { error: "You don't have permission to delete farmers" };
    }

    const farmer = await prisma.farmer.findFirst({
      where: { 
        id: params.farmerId, 
        companyId: params.id 
      },
    });

    if (!farmer) {
      set.status = 404;
      return { error: "Farmer not found" };
    }

    await prisma.farmer.delete({
      where: { id: params.farmerId },
    });

    return { success: true, message: "Farmer deleted successfully" };
  })

  // ========== FARMER GROUP ROUTES ==========

  // GET /:id/worker/group - Get all farmer groups for a company
  .get("/:id/worker/group", async ({ request, params, set }) => {
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

    const canView = await hasPermission(session.user.id, params.id, "member:user:view");
    if (!canView) {
      set.status = 403;
      return { error: "You don't have permission to view farmer groups" };
    }

    const farmerGroups = await prisma.farmerGroup.findMany({
      where: { companyId: params.id },
      include: {
        farmers: {
          include: {
            farmer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nationalId: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Transform data to match frontend expectations
    const transformedGroups = farmerGroups.map(group => ({
      ...group,
      farmers: group.farmers.map(fgf => fgf.farmer),
    }));

    return { farmerGroups: transformedGroups };
  })

  // GET /:id/worker/group/:groupId - Get specific farmer group
  .get("/:id/worker/group/:groupId", async ({ request, params, set }) => {
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

    const canView = await hasPermission(session.user.id, params.id, "member:user:view");
    if (!canView) {
      set.status = 403;
      return { error: "You don't have permission to view farmer groups" };
    }

    const farmerGroup = await prisma.farmerGroup.findFirst({
      where: { 
        id: params.groupId, 
        companyId: params.id 
      },
      include: {
        farmers: {
          include: {
            farmer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nationalId: true,
                phoneNumber: true,
                address: true,
              },
            },
          },
        },
      },
    });

    if (!farmerGroup) {
      set.status = 404;
      return { error: "Farmer group not found" };
    }

    // Transform data to match frontend expectations
    const transformedGroup = {
      ...farmerGroup,
      farmers: farmerGroup.farmers.map(fgf => fgf.farmer),
    };

    return { farmerGroup: transformedGroup };
  })

  // POST /:id/worker/group - Create new farmer group
  .post(
    "/:id/worker/group",
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

      const canCreate = await hasPermission(session.user.id, params.id, "member:user:create");
      if (!canCreate) {
        set.status = 403;
        return { error: "You don't have permission to create farmer groups" };
      }

      const { name, farmerIds } = body as {
        name: string;
        farmerIds?: string[];
      };

      if (!name || name.trim().length === 0) {
        set.status = 400;
        return { error: "Name is required" };
      }

      // Check if all farmerIds exist and belong to the same company (if provided)
      if (farmerIds && farmerIds.length > 0) {
        const farmers = await prisma.farmer.findMany({
          where: { 
            id: { in: farmerIds },
            companyId: params.id 
          },
        });

        if (farmers.length !== farmerIds.length) {
          set.status = 400;
          return { error: "One or more farmers not found or don't belong to this company" };
        }
      }

      const farmerGroup = await prisma.farmerGroup.create({
        data: {
          companyId: params.id,
          name: name.trim(),
          farmers: farmerIds && farmerIds.length > 0 ? {
            create: farmerIds.map(farmerId => ({
              farmerId: farmerId,
            })),
          } : undefined,
        },
        include: {
          farmers: {
            include: {
              farmer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  nationalId: true,
                },
              },
            },
          },
        },
      });

      // Transform data to match frontend expectations
      const transformedGroup = {
        ...farmerGroup,
        farmers: farmerGroup.farmers.map(fgf => fgf.farmer),
      };

      return { farmerGroup: transformedGroup };
    },
    {
      body: t.Object({
        name: t.String(),
        farmerIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // PUT /:id/worker/group/:groupId - Update farmer group
  .put(
    "/:id/worker/group/:groupId",
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

      const canUpdate = await hasPermission(session.user.id, params.id, "member:user:update");
      if (!canUpdate) {
        set.status = 403;
        return { error: "You don't have permission to update farmer groups" };
      }

      const existingGroup = await prisma.farmerGroup.findFirst({
        where: { 
          id: params.groupId, 
          companyId: params.id 
        },
      });

      if (!existingGroup) {
        set.status = 404;
        return { error: "Farmer group not found" };
      }

      const { name, farmerIds } = body as {
        name?: string;
        farmerIds?: string[];
      };

      const updateData: any = {};

      if (name !== undefined) {
        if (name.trim().length === 0) {
          set.status = 400;
          return { error: "Name cannot be empty" };
        }
        updateData.name = name.trim();
      }

      if (farmerIds !== undefined) {
        // Check if all farmerIds exist and belong to the same company
        if (farmerIds.length > 0) {
          const farmers = await prisma.farmer.findMany({
            where: { 
              id: { in: farmerIds },
              companyId: params.id 
            },
          });

          if (farmers.length !== farmerIds.length) {
            set.status = 400;
            return { error: "One or more farmers not found or don't belong to this company" };
          }
        }

        // Update farmer groups relationship
        // First, delete all existing relationships
        await prisma.farmerGroupFarmer.deleteMany({
          where: { farmerGroupId: params.groupId },
        });

        // Then, create new relationships
        if (farmerIds.length > 0) {
          updateData.farmers = {
            create: farmerIds.map(farmerId => ({
              farmerId: farmerId,
            })),
          };
        }
      }

      const farmerGroup = await prisma.farmerGroup.update({
        where: { id: params.groupId },
        data: updateData,
        include: {
          farmers: {
            include: {
              farmer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  nationalId: true,
                },
              },
            },
          },
        },
      });

      // Transform data to match frontend expectations
      const transformedGroup = {
        ...farmerGroup,
        farmers: farmerGroup.farmers.map(fgf => fgf.farmer),
      };

      return { farmerGroup: transformedGroup };
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        farmerIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // DELETE /:id/worker/group/:groupId - Delete farmer group
  .delete("/:id/worker/group/:groupId", async ({ request, params, set }) => {
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

    const canDelete = await hasPermission(session.user.id, params.id, "member:user:delete");
    if (!canDelete) {
      set.status = 403;
      return { error: "You don't have permission to delete farmer groups" };
    }

    const farmerGroup = await prisma.farmerGroup.findFirst({
      where: { 
        id: params.groupId, 
        companyId: params.id 
      },
    });

    if (!farmerGroup) {
      set.status = 404;
      return { error: "Farmer group not found" };
    }

    await prisma.farmerGroup.delete({
      where: { id: params.groupId },
    });

    return { success: true, message: "Farmer group deleted successfully" };
  });

