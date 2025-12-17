import { Elysia, t } from "elysia";
import { auth } from "./auth";
import { prisma } from "../db";

export const companyRoutes = new Elysia({ prefix: "/api/company" })
  // GET /api/company - Get all companies for current user
  .get("/", async ({ request, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompanies = await prisma.userCompany.findMany({
      where: { userId: session.user.id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            userId: true,
            stripeSubscriptionId: true,
            stripePriceId: true,
            stripeCurrentPeriodEnd: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      companies: userCompanies.map((uc) => ({
        ...uc.company,
        isOwner: uc.role.name === "owner",
        role: uc.role.name,
        hasActiveSubscription: uc.company.stripeSubscriptionId && 
          uc.company.stripeCurrentPeriodEnd && 
          new Date(uc.company.stripeCurrentPeriodEnd) > new Date(),
      })),
    };
  })

  // GET /api/company/permissions - Get all permissions
  .get("/permissions", async ({ request, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const permissions = await prisma.permission.findMany({
      orderBy: { name: "asc" },
    });

    return { permissions };
  })

  // GET /api/company/users/search?email=... - Search user by email
  .get("/users/search", async ({ request, query, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { email } = query as { email?: string };

    if (!email || email.trim().length === 0) {
      set.status = 400;
      return { error: "Email is required" };
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim() },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });

    if (!user) {
      set.status = 404;
      return { error: "User not found" };
    }

    return { user };
  })

  // GET /api/company/:id - Get company by ID
  .get("/:id", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    // Check if user has access to this company
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: session.user.id,
        companyId: params.id,
      },
      include: {
        company: {
          include: {
            users: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                  },
                },
                role: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    return {
      company: {
        ...userCompany.company,
        isOwner: userCompany.role.name === "owner",
        role: userCompany.role.name,
        hasActiveSubscription: userCompany.company.stripeSubscriptionId && 
          userCompany.company.stripeCurrentPeriodEnd && 
          new Date(userCompany.company.stripeCurrentPeriodEnd) > new Date(),
        members: userCompany.company.users.map((uc) => ({
          ...uc.user,
          role: uc.role.name,
          joinedAt: uc.createdAt,
        })),
      },
    };
  })

  // POST /api/company - Create new company
  .post(
    "/",
    async ({ request, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { name } = body as { name: string };

      if (!name || name.trim().length === 0) {
        set.status = 400;
        return { error: "Company name is required" };
      }

      try {
        // Create company
        const company = await prisma.company.create({
          data: {
            name: name.trim(),
            userId: session.user.id,
          },
        });

        // Get all permissions
        const allPermissions = await prisma.permission.findMany();

        // Create "owner" role for this company
        const ownerRole = await prisma.role.create({
          data: {
            name: "owner",
            companyId: company.id,
            permissions: {
              connect: allPermissions.map(perm => ({ id: perm.id })),
            },
          },
        });

        // Add creator as member with owner role
        await prisma.userCompany.create({
          data: {
            userId: session.user.id,
            companyId: company.id,
            roleId: ownerRole.id,
          },
        });

        return {
          company: {
            ...company,
            isOwner: true,
            role: "owner",
            hasActiveSubscription: false,
          },
        };
      } catch (error: any) {
        if (error.code === "P2002") {
          set.status = 409;
          return { error: "Company name already exists" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
      }),
    }
  )

  // PUT /api/company/:id - Update company
  .put(
    "/:id",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      // Check if user has owner role
      const userCompany = await prisma.userCompany.findFirst({
        where: {
          userId: session.user.id,
          companyId: params.id,
        },
        include: {
          role: true,
        },
      });

      if (!userCompany || userCompany.role.name !== "owner") {
        set.status = 403;
        return { error: "Only owner can update company" };
      }

      const { name } = body as { name: string };

      if (!name || name.trim().length === 0) {
        set.status = 400;
        return { error: "Company name is required" };
      }

      try {
        const updatedCompany = await prisma.company.update({
          where: { id: params.id },
          data: {
            name: name.trim(),
          },
        });

        return {
          company: {
            ...updatedCompany,
            isOwner: true,
            hasActiveSubscription: updatedCompany.stripeSubscriptionId && 
              updatedCompany.stripeCurrentPeriodEnd && 
              new Date(updatedCompany.stripeCurrentPeriodEnd) > new Date(),
          },
        };
      } catch (error: any) {
        if (error.code === "P2002") {
          set.status = 409;
          return { error: "Company name already exists" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
      }),
    }
  )

  // DELETE /api/company/:id - Delete company
  .delete("/:id", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

      // Check if user has owner role
      const userCompany = await prisma.userCompany.findFirst({
        where: {
          userId: session.user.id,
          companyId: params.id,
        },
        include: {
          role: true,
        },
      });

      if (!userCompany || userCompany.role.name !== "owner") {
        set.status = 403;
        return { error: "Only owner can delete company" };
      }

    // Delete company (cascade will delete UserCompany relations)
    await prisma.company.delete({
      where: { id: params.id },
    });

    return { success: true, message: "Company deleted successfully" };
  })

  // POST /api/company/:id/members - Add member to company
  .post(
    "/:id/members",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      // Check if user has access to this company (owner or admin can add members)
      const userCompany = await prisma.userCompany.findFirst({
        where: {
          userId: session.user.id,
          companyId: params.id,
        },
        include: { 
          company: true,
          role: true,
        },
      });

      if (!userCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      // Only owner can add members (can extend to admin later)
      if (userCompany.role.name !== "owner") {
        set.status = 403;
        return { error: "Only owner can add members" };
      }

      const { userId, roleId } = body as { userId: string; roleId?: string };

      if (!userId) {
        set.status = 400;
        return { error: "User ID is required" };
      }

      if (!roleId) {
        set.status = 400;
        return { error: "Role ID is required" };
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        set.status = 404;
        return { error: "User not found" };
      }

      // Check if already a member
      const existingMember = await prisma.userCompany.findFirst({
        where: {
          userId: userId,
          companyId: params.id,
        },
      });

      if (existingMember) {
        set.status = 409;
        return { error: "User is already a member of this company" };
      }

      // Check if role exists and belongs to this company
      const role = await prisma.role.findFirst({
        where: {
          id: roleId,
          companyId: params.id,
        },
      });

      if (!role) {
        set.status = 404;
        return { error: "Role not found or does not belong to this company" };
      }

      // Prevent assigning owner role
      if (role.name === "owner") {
        set.status = 400;
        return { error: "Cannot assign owner role. Owner role is automatically assigned to company creator." };
      }

      // Add member
      await prisma.userCompany.create({
        data: {
          userId: userId,
          companyId: params.id,
          roleId: role.id,
        },
      });

      return { success: true, message: "Member added successfully" };
    },
    {
      body: t.Object({
        userId: t.String(),
        roleId: t.String(),
      }),
    }
  )

  // PUT /api/company/:id/members/:userId - Update member role
  .put(
    "/:id/members/:userId",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      // Check if user has access to this company
      const currentUserCompany = await prisma.userCompany.findFirst({
        where: {
          userId: session.user.id,
          companyId: params.id,
        },
        include: {
          role: true,
        },
      });

      if (!currentUserCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      // Only owner can update member roles
      if (currentUserCompany.role.name !== "owner") {
        set.status = 403;
        return { error: "Only owner can update member roles" };
      }

      // Check if member exists and get their current role
      const memberUserCompany = await prisma.userCompany.findFirst({
        where: {
          userId: params.userId,
          companyId: params.id,
        },
        include: {
          role: true,
        },
      });

      if (!memberUserCompany) {
        set.status = 404;
        return { error: "User is not a member of this company" };
      }

      // Prevent editing owner
      if (memberUserCompany.role.name === "owner") {
        set.status = 400;
        return { error: "Cannot edit owner. Owner role cannot be changed." };
      }

      const { roleId } = body as { roleId: string };

      if (!roleId) {
        set.status = 400;
        return { error: "Role ID is required" };
      }

      // Check if new role exists and belongs to this company
      const newRole = await prisma.role.findFirst({
        where: {
          id: roleId,
          companyId: params.id,
        },
      });

      if (!newRole) {
        set.status = 404;
        return { error: "Role not found or does not belong to this company" };
      }

      // Prevent assigning owner role
      if (newRole.name === "owner") {
        set.status = 400;
        return { error: "Cannot assign owner role. Owner role is automatically assigned to company creator." };
      }

      // Update member role
      await prisma.userCompany.update({
        where: {
          id: memberUserCompany.id,
        },
        data: {
          roleId: newRole.id,
        },
      });

      return { success: true, message: "Member role updated successfully" };
    },
    {
      body: t.Object({
        roleId: t.String(),
      }),
    }
  )

  // DELETE /api/company/:id/members/:userId - Remove member from company
  .delete("/:id/members/:userId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    // Check if user has access to this company
    const currentUserCompany = await prisma.userCompany.findFirst({
      where: {
        userId: session.user.id,
        companyId: params.id,
      },
      include: {
        role: true,
      },
    });

    if (!currentUserCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    // Check if removing user exists and get their role
    const removingUserCompany = await prisma.userCompany.findFirst({
      where: {
        userId: params.userId,
        companyId: params.id,
      },
      include: {
        role: true,
      },
    });

    if (!removingUserCompany) {
      set.status = 404;
      return { error: "User is not a member of this company" };
    }

    // Prevent removing owner
    if (removingUserCompany.role.name === "owner") {
      set.status = 400;
      return { error: "Cannot remove owner. Transfer ownership first or delete the company." };
    }

    const isOwner = currentUserCompany.role.name === "owner";
    const isRemovingSelf = params.userId === session.user.id;

    // Only owner can remove other members, or user can remove themselves
    if (!isOwner && !isRemovingSelf) {
      set.status = 403;
      return { error: "Only owner can remove other members" };
    }

    // Remove member
    await prisma.userCompany.deleteMany({
      where: {
        userId: params.userId,
        companyId: params.id,
      },
    });

    return { success: true, message: "Member removed successfully" };
  })

  // GET /api/company/:id/roles - Get all roles for a company
  .get("/:id/roles", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    // Check if user has access to this company
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: session.user.id,
        companyId: params.id,
      },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const roles = await prisma.role.findMany({
      where: { companyId: params.id },
      include: {
        permissions: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return { roles };
  })

  // GET /api/company/:id/roles/:roleId - Get role by ID with users
  .get("/:id/roles/:roleId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    // Check if user has access to this company
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: session.user.id,
        companyId: params.id,
      },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    // Get role with users
    const role = await prisma.role.findFirst({
      where: {
        id: params.roleId,
        companyId: params.id,
      },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
        permissions: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!role) {
      set.status = 404;
      return { error: "Role not found" };
    }

    return {
      role: {
        ...role,
        users: role.users.map((uc) => ({
          ...uc.user,
          joinedAt: uc.createdAt,
        })),
      },
    };
  })

  // POST /api/company/:id/roles - Create new role
  .post(
    "/:id/roles",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      // Check if user has owner role
      const userCompany = await prisma.userCompany.findFirst({
        where: {
          userId: session.user.id,
          companyId: params.id,
        },
        include: {
          role: true,
        },
      });

      if (!userCompany || userCompany.role.name !== "owner") {
        set.status = 403;
        return { error: "Only owner can create roles" };
      }

      const { name, permissionIds } = body as { name: string; permissionIds?: string[] };

      if (!name || name.trim().length === 0) {
        set.status = 400;
        return { error: "Role name is required" };
      }

      // Prevent creating owner role
      if (name.toLowerCase() === "owner") {
        set.status = 400;
        return { error: "Cannot create owner role. Owner role is automatically created." };
      }

      try {
        const role = await prisma.role.create({
          data: {
            name: name.trim().toLowerCase(),
            companyId: params.id,
            permissions: permissionIds && permissionIds.length > 0
              ? {
                  connect: permissionIds.map(id => ({ id })),
                }
              : undefined,
          },
          include: {
            permissions: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        return { role };
      } catch (error: any) {
        if (error.code === "P2002") {
          set.status = 409;
          return { error: "Role name already exists for this company" };
        }
        throw error;
      }
      },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 50 }),
        permissionIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // PUT /api/company/:id/roles/:roleId - Update role
  .put(
    "/:id/roles/:roleId",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      // Check if user has owner role
      const userCompany = await prisma.userCompany.findFirst({
        where: {
          userId: session.user.id,
          companyId: params.id,
        },
        include: {
          role: true,
        },
      });

      if (!userCompany || userCompany.role.name !== "owner") {
        set.status = 403;
        return { error: "Only owner can update roles" };
      }

      // Check if role exists and belongs to this company
      const role = await prisma.role.findFirst({
        where: {
          id: params.roleId,
          companyId: params.id,
        },
      });

      if (!role) {
        set.status = 404;
        return { error: "Role not found" };
      }

      // Prevent editing owner role
      if (role.name === "owner") {
        set.status = 400;
        return { error: "Cannot edit owner role" };
      }

      const { name, permissionIds } = body as { name: string; permissionIds?: string[] };

      if (!name || name.trim().length === 0) {
        set.status = 400;
        return { error: "Role name is required" };
      }

      // Prevent renaming to owner
      if (name.toLowerCase() === "owner") {
        set.status = 400;
        return { error: "Cannot rename role to owner" };
      }

      try {
        // Build update data
        const updateData: any = {
          name: name.trim().toLowerCase(),
        };

        // Update permissions if provided
        if (permissionIds !== undefined) {
          // First, disconnect all existing permissions
          await prisma.role.update({
            where: { id: params.roleId },
            data: {
              permissions: {
                set: [],
              },
            },
          });

          // Then connect new permissions
          if (permissionIds.length > 0) {
            updateData.permissions = {
              connect: permissionIds.map(id => ({ id })),
            };
          }
        }

        const updatedRole = await prisma.role.update({
          where: { id: params.roleId },
          data: updateData,
          include: {
            permissions: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        return { role: updatedRole };
      } catch (error: any) {
        if (error.code === "P2002") {
          set.status = 409;
          return { error: "Role name already exists for this company" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 50 }),
        permissionIds: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // DELETE /api/company/:id/roles/:roleId - Delete role
  .delete("/:id/roles/:roleId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    // Check if user has owner role
    const userCompany = await prisma.userCompany.findFirst({
      where: {
        userId: session.user.id,
        companyId: params.id,
      },
      include: {
        role: true,
      },
    });

    if (!userCompany || userCompany.role.name !== "owner") {
      set.status = 403;
      return { error: "Only owner can delete roles" };
    }

    // Check if role exists and belongs to this company
    const role = await prisma.role.findFirst({
      where: {
        id: params.roleId,
        companyId: params.id,
      },
      include: {
        users: true,
      },
    });

    if (!role) {
      set.status = 404;
      return { error: "Role not found" };
    }

    // Prevent deleting owner role
    if (role.name === "owner") {
      set.status = 400;
      return { error: "Cannot delete owner role" };
    }

    // Check if role is being used
    if (role.users.length > 0) {
      set.status = 400;
      return { error: "Cannot delete role that is assigned to users. Reassign users first." };
    }

    // Delete role
    await prisma.role.delete({
      where: { id: params.roleId },
    });

    return { success: true, message: "Role deleted successfully" };
  });

