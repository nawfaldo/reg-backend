import { Elysia, t } from "elysia";
import Stripe from "stripe";
import { auth } from "./auth";
import { prisma } from "../db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const FRONTEND_URL = process.env.FRONTEND_URL || "https://reg-frontend-seven.vercel.app";

// Helper to safely get subscription period end date
function getSubscriptionPeriodEnd(subscription: any): Date {
  // Try different possible locations for the period end
  const periodEnd = subscription.current_period_end 
    || subscription.data?.current_period_end
    || subscription.ended_at;
  
  if (!periodEnd) {
    // Fallback: 30 days from now
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  
  // If it's already a Date object
  if (periodEnd instanceof Date) {
    return periodEnd;
  }
  
  // If it's a Unix timestamp (number in seconds)
  if (typeof periodEnd === 'number') {
    return new Date(periodEnd * 1000);
  }
  
  // If it's a string timestamp
  if (typeof periodEnd === 'string') {
    const parsed = new Date(periodEnd);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  // Fallback
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

export const paymentRoutes = new Elysia({ prefix: "/api/payment" })
  .post("/create-checkout-session", async ({ request, body, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userId = session.user.id;
    const userEmail = session.user.email;
    const { priceId, companyId } = body as { priceId: string; companyId?: string };

    // Get or create company for user
    let company;
    if (companyId) {
      company = await prisma.company.findFirst({
        where: { 
          id: companyId,
          users: {
            some: { userId: userId }
          }
        },
      });
    } else {
      // Get first company or create default
      const userCompanies = await prisma.userCompany.findMany({
        where: { userId },
        include: { company: true },
      });

      if (userCompanies.length > 0) {
        company = userCompanies[0].company;
      } else {
        // Create default company
        company = await prisma.company.create({
          data: {
            name: `${session.user.name}'s Company`,
            userId: userId,
          },
        });
        
        // Create "owner" role for this company
        const ownerRole = await prisma.role.create({
          data: {
            name: "owner",
            companyId: company.id,
          },
        });
        
        // Add user to company with owner role
        await prisma.userCompany.create({
          data: {
            userId: userId,
            companyId: company.id,
            roleId: ownerRole.id,
          },
        });
      }
    }

    if (!company) {
      set.status = 400;
      return { error: "Company not found" };
    }
    
    let customerId = company.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { companyId: company.id, userId: userId },
      });
      customerId = customer.id;

      await prisma.company.update({
        where: { id: company.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      allow_promotion_codes: true,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/client/company/${encodeURIComponent(company.name)}/setting`,
      cancel_url: `${FRONTEND_URL}/client/company/${encodeURIComponent(company.name)}/setting`,
      metadata: { userId: userId, companyId: company.id },
    });

    return { url: checkoutSession.url };
  })

  .post("/webhook", async ({ request, set }) => {
    const body = await request.text();
    const sig = request.headers.get("stripe-signature");

    if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
        set.status = 400;
        return "Missing signature or secret";
    }

    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      set.status = 400;
      return `Webhook Error: ${err.message}`;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          
          // Pastikan data penting ada sebelum lanjut
          if (!session.subscription || !session.customer) {
            console.error("⚠️ Missing subscription or customer ID in session");
            break;
          }

          const subscriptionId = session.subscription as string;
          const customerId = session.customer as string;

          const subscription = await stripe.subscriptions.retrieve(subscriptionId);

          const company = await prisma.company.findFirst({
            where: { stripeCustomerId: customerId },
          });

          if (company) {
            await prisma.company.update({
              where: { id: company.id },
              data: {
                stripeSubscriptionId: subscription.id,
                stripePriceId: subscription.items.data[0].price.id,
                stripeCurrentPeriodEnd: getSubscriptionPeriodEnd(subscription),
              },
            });
            console.log(`✅ [Webhook] Checkout Success: Company ${company.name} is now subscribed.`);
          } else {
             console.error(`⚠️ Company not found for Stripe Customer: ${customerId}`);
          }
          break;
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionId = (invoice as any).subscription as string | null;
          const customerId = invoice.customer as string;

          if (subscriptionId && customerId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            
            const company = await prisma.company.findFirst({
                where: { stripeCustomerId: customerId },
            });

            if (company) {
                await prisma.company.update({
                    where: { id: company.id },
                    data: {
                        stripeCurrentPeriodEnd: getSubscriptionPeriodEnd(subscription),
                    },
                });
                console.log(`✅ [Webhook] Payment Recurred: Company ${company.name} subscription extended.`);
            }
          }
          break;
        }

        case "invoice.payment_failed": {
           const invoice = event.data.object as Stripe.Invoice;
           console.log(`❌ [Webhook] Payment failed for customer ${invoice.customer}`);
           break;
        }
      }
    } catch (err: any) {
      console.error("❌ Error processing webhook event:", err.message);
      return { received: true, status: "processed_with_errors" };
    }

    return { received: true };
  });