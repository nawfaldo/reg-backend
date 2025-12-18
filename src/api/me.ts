import { Elysia, t } from "elysia";
import { auth } from "./auth";
import { prisma } from "../db";

export const meRoutes = new Elysia({ prefix: "/api" })
  .get("/me", async ({ request, set }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        set.status = 401;
        return { user: null, subscription: null };
      }
      
      const userCompanies = await prisma.userCompany.findMany({
        where: { userId: session.user.id },
        include: { 
          company: {
            select: {
              id: true,
              name: true,
              stripeSubscriptionId: true,
              stripePriceId: true,
              stripeCurrentPeriodEnd: true,
            }
          }
        },
      });

      const companyWithSubscription = userCompanies.find(uc => {
        const company = uc.company;
        return company.stripeSubscriptionId && 
          company.stripeCurrentPeriodEnd && 
          new Date(company.stripeCurrentPeriodEnd) > new Date();
      });

      const subscription = companyWithSubscription?.company;
      const isSubscribed = !!subscription;

      return { 
        user: session.user,
        subscription: subscription ? {
          isActive: isSubscribed,
          priceId: subscription.stripePriceId,
          currentPeriodEnd: subscription.stripeCurrentPeriodEnd,
        } : null,
      };
    } catch (error: any) {
      console.error("Error in /api/me:", error);
      const session = await auth.api.getSession({ headers: request.headers });
      return { 
        user: session?.user || null, 
        subscription: null 
      };
    }
  })
  .put("/me", async ({ request, body, set }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const { name, image } = body as { name?: string; image?: string };

      // Validate input
      if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
        set.status = 400;
        return { error: "Name must be a non-empty string" };
      }

      if (image !== undefined && typeof image !== "string") {
        set.status = 400;
        return { error: "Image must be a string" };
      }

      // Build update object
      const updateData: { name?: string; image?: string | null } = {};
      if (name !== undefined) {
        updateData.name = name.trim();
      }
      if (image !== undefined) {
        updateData.image = image.trim() === "" ? null : image;
      }

      // If no fields to update
      if (Object.keys(updateData).length === 0) {
        set.status = 400;
        return { error: "No fields to update" };
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id: session.user.id },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return { user: updatedUser };
    } catch (error: any) {
      console.error("Error updating user profile:", error);
      set.status = 500;
      return { error: "Failed to update profile" };
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      image: t.Optional(t.String()),
    }),
  });

