import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { prisma } from "../../db";
import { hasPermission } from "./utils";

export const roleRoutes = new Elysia()
  .get("/:id/roles", async ({ request, params, set }) => {
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

    const canViewRoles = await hasPermission(session.user.id, params.id, "member:role:view");
    if (!canViewRoles) {
      set.status = 403;
      return { error: "You don't have permission to view roles" };
    }

    const roles = await prisma.role.findMany({
      where: { companyId: params.id },
      include: {
        permissions: { select: { id: true, name: true, desc: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return { roles };
  })

  // GET /:id/roles/:roleId
  .get("/:id/roles/:roleId", async ({ request, params, set }) => {
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

    const canViewRoles = await hasPermission(session.user.id, params.id, "member:role:view");
    if (!canViewRoles) {
      set.status = 403;
      return { error: "You don't have permission to view roles" };
    }

    const role = await prisma.role.findFirst({
      where: { id: params.roleId, companyId: params.id },
      include: {
        users: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        permissions: { select: { id: true, name: true, desc: true } },
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

  // POST /:id/roles
  .post(
    "/:id/roles",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: params.id },
        include: { role: true },
      });

      if (!userCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      const canCreateRole = await hasPermission(session.user.id, params.id, "member:role:create");
      if (!canCreateRole) {
        set.status = 403;
        return { error: "You don't have permission to create roles" };
      }

      const { name, permissionIds } = body as { name: string; permissionIds?: string[] };

      if (!name || name.trim().length === 0) {
        set.status = 400;
        return { error: "Role name is required" };
      }

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
              ? { connect: permissionIds.map(id => ({ id })) }
              : undefined,
          },
          include: {
            permissions: { select: { id: true, name: true, desc: true } },
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

  // PUT /:id/roles/:roleId
  .put(
    "/:id/roles/:roleId",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: params.id },
        include: { role: true },
      });

      if (!userCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      const canUpdateRole = await hasPermission(session.user.id, params.id, "member:role:update");
      if (!canUpdateRole) {
        set.status = 403;
        return { error: "You don't have permission to update roles" };
      }

      const role = await prisma.role.findFirst({
        where: { id: params.roleId, companyId: params.id },
      });

      if (!role) {
        set.status = 404;
        return { error: "Role not found" };
      }

      if (role.name === "owner") {
        set.status = 400;
        return { error: "Cannot edit owner role" };
      }

      const { name, permissionIds } = body as { name: string; permissionIds?: string[] };

      if (!name || name.trim().length === 0) {
        set.status = 400;
        return { error: "Role name is required" };
      }

      if (name.toLowerCase() === "owner") {
        set.status = 400;
        return { error: "Cannot rename role to owner" };
      }

      try {
        const updateData: any = { name: name.trim().toLowerCase() };

        if (permissionIds !== undefined) {
          await prisma.role.update({
            where: { id: params.roleId },
            data: { permissions: { set: [] } },
          });

          if (permissionIds.length > 0) {
            updateData.permissions = { connect: permissionIds.map(id => ({ id })) };
          }
        }

        const updatedRole = await prisma.role.update({
          where: { id: params.roleId },
          data: updateData,
          include: {
            permissions: { select: { id: true, name: true, desc: true } },
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

  // DELETE /:id/roles/:roleId
  .delete("/:id/roles/:roleId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
      include: { role: true },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canDeleteRole = await hasPermission(session.user.id, params.id, "member:role:delete");
    if (!canDeleteRole) {
      set.status = 403;
      return { error: "You don't have permission to delete roles" };
    }

    const role = await prisma.role.findFirst({
      where: { id: params.roleId, companyId: params.id },
      include: { users: true },
    });

    if (!role) {
      set.status = 404;
      return { error: "Role not found" };
    }

    if (role.name === "owner") {
      set.status = 400;
      return { error: "Cannot delete owner role" };
    }

    if (role.users.length > 0) {
      set.status = 400;
      return { error: "Cannot delete role that is assigned to users. Reassign users first." };
    }

    await prisma.role.delete({ where: { id: params.roleId } });

    return { success: true, message: "Role deleted successfully" };
  });