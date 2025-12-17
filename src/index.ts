import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { auth } from "./api/auth";
import { dts } from "elysia-remote-dts";
import { paymentRoutes } from "./api/payment";
import { companyRoutes } from "./api/company";
import { prisma } from "./db";

const app = new Elysia()
  .use(
    cors({
      origin: "http://localhost:5173",
      credentials: true,
    }),
  )
  .mount(auth.handler)
  .get("/api/me", async ({ request }) => {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return { user: null, subscription: null };
      
      // Get user's companies and find active subscription
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

      // Find company with active subscription
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
      // Fallback: return user without subscription if there's an error
      const session = await auth.api.getSession({ headers: request.headers });
      return { 
        user: session?.user || null, 
        subscription: null 
      };
    }
  })
  .use(dts("./src/index.ts"))
  .use(paymentRoutes)
  .use(companyRoutes)
  .listen(3000, async ({ hostname, port }) => {
    console.log(`Server is running at ${hostname}:${port}`);

    if (process.env.NODE_ENV === "development") {
      try {
        console.log("Syncing types to Frontend...");

        const req = await fetch(`http://${hostname}:${port}/server.d.ts`);
        const typeDefinition = await req.text();

        await Bun.write("../website/src/lib/server.d.ts", typeDefinition);

        console.log("Types synced successfully!");
      } catch (e) {
        console.error("❌ Failed to sync types:", e);
      }
    }
  });

export type App = typeof app;
