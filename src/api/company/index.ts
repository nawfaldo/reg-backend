import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { prisma } from "../../db";
import { hasPermission } from "./utils";
import { roleRoutes } from "./roles";
import { memberRoutes } from "./members";

export const companyRoutes = new Elysia({ prefix: "/api/company" })
  .use(roleRoutes)
  .use(memberRoutes)

  .get("/permissions", async ({ request, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    const permissions = await prisma.permission.findMany({ orderBy: { name: "asc" } });
    return { permissions };
  })

  // Route: Search users
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
      select: { id: true, name: true, email: true, image: true },
    });
    if (!user) {
      set.status = 404;
      return { error: "User not found" };
    }
    return { user };
  })

  // Route: Get By Name
  .get("/name/:name", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    const company = await prisma.company.findUnique({
      where: { name: params.name },
      select: {
        id: true,
        name: true,
        image: true,
        stripeSubscriptionId: true,
        stripeCurrentPeriodEnd: true,
      },
    });

    if (!company) {
      set.status = 404;
      return { error: "Company not found" };
    }

    const userCompanies = await prisma.userCompany.findMany({
      where: { userId: session.user.id, companyId: company.id },
      include: {
        role: { include: { permissions: { select: { name: true } } } },
      },
    });

    if (userCompanies.length === 0) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const allPermissions = new Set<string>();
    let isOwner = false;
    const roles = userCompanies.map((uc) => uc.role);

    roles.forEach((role) => {
      if (role.name === "owner") isOwner = true;
      role.permissions.forEach((perm) => allPermissions.add(perm.name));
    });

    const hasActiveSubscription =
      company.stripeSubscriptionId &&
      company.stripeCurrentPeriodEnd &&
      new Date(company.stripeCurrentPeriodEnd) > new Date();

    return {
      company: {
        id: company.id,
        name: company.name,
        image: company.image,
        isOwner,
        roles: roles.map((r) => r.name),
        permissions: Array.from(allPermissions),
        hasActiveSubscription,
        currentPeriodEnd: company.stripeCurrentPeriodEnd,
      },
    };
  })

  // GET / (List Companies)
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
            id: true, name: true, image: true, userId: true,
            stripeSubscriptionId: true, stripePriceId: true,
            stripeCurrentPeriodEnd: true, createdAt: true, updatedAt: true,
          },
        },
        role: { include: { permissions: { select: { id: true, name: true, desc: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      companies: userCompanies.map((uc) => ({
        ...uc.company,
        isOwner: uc.role.name === "owner",
        role: uc.role.name,
        permissions: uc.role.permissions.map((p) => p.name),
        hasActiveSubscription:
          uc.company.stripeSubscriptionId &&
          uc.company.stripeCurrentPeriodEnd &&
          new Date(uc.company.stripeCurrentPeriodEnd) > new Date(),
      })),
    };
  })

  // GET /:id (Get One Company)
  .get("/:id", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompanies = await prisma.userCompany.findMany({
      where: { userId: session.user.id, companyId: params.id },
      include: {
        company: {
          include: {
            users: {
              include: {
                user: { select: { id: true, name: true, email: true, image: true } },
                role: { select: { id: true, name: true } },
              },
            },
          },
        },
        role: { include: { permissions: { select: { id: true, name: true, desc: true } } } },
      },
    });

    if (userCompanies.length === 0) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const allPermissions = new Set<string>();
    let isOwner = false;
    const roles = userCompanies.map((uc) => uc.role);

    roles.forEach((role) => {
      if (role.name === "owner") isOwner = true;
      role.permissions.forEach((perm) => allPermissions.add(perm.name));
    });

    const canViewMembers = isOwner || allPermissions.has("member:user:view");
    let members: any[] = [];

    if (canViewMembers) {
      const userMap = new Map();
      userCompanies[0].company.users.forEach((uc) => {
        const userId = uc.user.id;
        if (!userMap.has(userId)) {
          userMap.set(userId, { ...uc.user, roles: [], joinedAt: uc.createdAt });
        }
        userMap.get(userId).roles.push({ id: uc.role.id, name: uc.role.name });
      });
      members = Array.from(userMap.values());
    }

    return {
      company: {
        ...userCompanies[0].company,
        isOwner,
        roles: roles.map((r) => r.name),
        permissions: Array.from(allPermissions),
        hasActiveSubscription:
          userCompanies[0].company.stripeSubscriptionId &&
          userCompanies[0].company.stripeCurrentPeriodEnd &&
          new Date(userCompanies[0].company.stripeCurrentPeriodEnd) > new Date(),
        members,
      },
    };
  })

  // POST / (Create Company)
  .post(
    "/",
    async ({ request, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { name, image } = body as { name: string; image?: string };

      if (!name || name.trim().length === 0) {
        set.status = 400;
        return { error: "Company name is required" };
      }

      try {
        const company = await prisma.company.create({
          data: {
            name: name.trim(),
            image: image && image.trim().length > 0 ? image.trim() : null,
            userId: session.user.id,
          },
        });

        const allPermissions = await prisma.permission.findMany();

        const ownerRole = await prisma.role.create({
          data: {
            name: "owner",
            companyId: company.id,
            permissions: { connect: allPermissions.map((perm) => ({ id: perm.id })) },
          },
        });

        await prisma.userCompany.create({
          data: {
            userId: session.user.id,
            companyId: company.id,
            roleId: ownerRole.id,
          },
        });

        return {
          company: { ...company, isOwner: true, role: "owner", hasActiveSubscription: false },
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
        image: t.Optional(t.String()),
      }),
    }
  )

  // PUT /:id (Update Company)
  .put(
    "/:id",
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

      const canUpdate = await hasPermission(session.user.id, params.id, "company:update");
      if (!canUpdate) {
        set.status = 403;
        return { error: "You don't have permission to update company" };
      }

      const { name } = body as { name: string };
      if (!name || name.trim().length === 0) {
        set.status = 400;
        return { error: "Company name is required" };
      }

      try {
        const updatedCompany = await prisma.company.update({
          where: { id: params.id },
          data: { name: name.trim() },
        });

        return {
          company: {
            ...updatedCompany,
            isOwner: true,
            hasActiveSubscription:
              updatedCompany.stripeSubscriptionId &&
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

  // DELETE /:id (Delete Company)
  .delete("/:id", async ({ request, params, set }) => {
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

    const canDelete = await hasPermission(session.user.id, params.id, "company:delete");
    if (!canDelete) {
      set.status = 403;
      return { error: "You don't have permission to delete company" };
    }

    await prisma.company.delete({ where: { id: params.id } });

    return { success: true, message: "Company deleted successfully" };
  });