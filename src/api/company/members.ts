// members.ts
import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { prisma } from "../../db";
import { hasPermission } from "./utils";

export const memberRoutes = new Elysia()
  // POST /:id/members
  .post(
    "/:id/members",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: params.id },
        include: { company: true, role: true },
      });

      if (!userCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      const canAddMember = await hasPermission(session.user.id, params.id, "member:user:create");
      if (!canAddMember) {
        set.status = 403;
        return { error: "You don't have permission to add members" };
      }

      const { userId, roleIds } = body as { userId: string; roleIds?: string[] };

      if (!userId) {
        set.status = 400;
        return { error: "User ID is required" };
      }

      if (!roleIds || roleIds.length === 0) {
        set.status = 400;
        return { error: "At least one role ID is required" };
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        set.status = 404;
        return { error: "User not found" };
      }

      const roles = await prisma.role.findMany({
        where: { id: { in: roleIds }, companyId: params.id },
      });

      if (roles.length !== roleIds.length) {
        set.status = 404;
        return { error: "One or more roles not found or do not belong to this company" };
      }

      if (roles.some(role => role.name === "owner")) {
        set.status = 400;
        return { error: "Cannot assign owner role." };
      }

      const existingRecords = await prisma.userCompany.findMany({
        where: { userId: userId, companyId: params.id, roleId: { in: roleIds } },
      });

      const existingRoleIds = existingRecords.map(r => r.roleId);
      const newRoleIds = roleIds.filter(id => !existingRoleIds.includes(id));

      if (newRoleIds.length === 0) {
        set.status = 409;
        return { error: "User already has all selected roles in this company" };
      }

      await prisma.userCompany.createMany({
        data: newRoleIds.map(roleId => ({
          userId: userId,
          companyId: params.id,
          roleId: roleId,
        })),
      });

      return { success: true, message: "Member added successfully" };
    },
    {
      body: t.Object({
        userId: t.String(),
        roleIds: t.Array(t.String()),
      }),
    }
  )


  .put(
    "/:id/members/:userId",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const currentUserCompany = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: params.id },
        include: { role: true },
      });

      if (!currentUserCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      const canUpdateMember = await hasPermission(session.user.id, params.id, "member:user:update");
      if (!canUpdateMember) {
        set.status = 403;
        return { error: "You don't have permission to update member roles" };
      }

      const memberUserCompany = await prisma.userCompany.findFirst({
        where: { userId: params.userId, companyId: params.id },
        include: { role: true },
      });

      if (!memberUserCompany) {
        set.status = 404;
        return { error: "User is not a member of this company" };
      }

      if (memberUserCompany.role.name === "owner") {
        set.status = 400;
        return { error: "Cannot edit owner. Owner role cannot be changed." };
      }

      const { roleId } = body as { roleId: string };

      if (!roleId) {
        set.status = 400;
        return { error: "Role ID is required" };
      }

      const newRole = await prisma.role.findFirst({
        where: { id: roleId, companyId: params.id },
      });

      if (!newRole) {
        set.status = 404;
        return { error: "Role not found or does not belong to this company" };
      }

      if (newRole.name === "owner") {
        set.status = 400;
        return { error: "Cannot assign owner role." };
      }

      await prisma.userCompany.update({
        where: { id: memberUserCompany.id },
        data: { roleId: newRole.id },
      });

      return { success: true, message: "Member role updated successfully" };
    },
    {
      body: t.Object({
        roleId: t.String(),
      }),
    }
  )

  // DELETE /:id/members/:userId
  .delete("/:id/members/:userId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const currentUserCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
      include: { role: true },
    });

    if (!currentUserCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const removingUserCompany = await prisma.userCompany.findFirst({
      where: { userId: params.userId, companyId: params.id },
      include: { role: true },
    });

    if (!removingUserCompany) {
      set.status = 404;
      return { error: "User is not a member of this company" };
    }

    if (removingUserCompany.role.name === "owner") {
      set.status = 400;
      return { error: "Cannot remove owner." };
    }

    const isRemovingSelf = params.userId === session.user.id;

    if (!isRemovingSelf) {
      const canDeleteMember = await hasPermission(session.user.id, params.id, "member:user:delete");
      if (!canDeleteMember) {
        set.status = 403;
        return { error: "You don't have permission to remove members" };
      }
    }

    await prisma.userCompany.deleteMany({
      where: { userId: params.userId, companyId: params.id },
    });

    return { success: true, message: "Member removed successfully" };
  });