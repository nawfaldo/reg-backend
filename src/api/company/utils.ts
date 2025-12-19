import { prisma } from "../../db";

export async function hasPermission(
  userId: string,
  companyId: string,
  permissionName: string
): Promise<boolean> {
  const userCompany = await prisma.userCompany.findFirst({
    where: {
      userId,
      companyId,
    },
    include: {
      role: {
        include: {
          permissions: true,
        },
      },
    },
  });

  if (!userCompany) return false;

  if (userCompany.role.name === "owner") return true;

  const hasPermission = userCompany.role.permissions.some(
    (perm) => perm.name === permissionName
  );

  return hasPermission;
}