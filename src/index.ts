import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { auth } from "./api/auth";
import { dts } from "elysia-remote-dts";
import { paymentRoutes } from "./api/payment";
import { companyRoutes } from "./api/company";
import { meRoutes } from "./api/me";

const app = new Elysia()
  .use(
    cors({
      origin: [
        "http://localhost:5173", 
        process.env.FRONTEND_URL || "", 
        "https://reg-frontend-seven.vercel.app"
      ].filter(Boolean),
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"], 
    }),
  )
  .mount(auth.handler)
  .use(dts("./src/index.ts"))
  .use(meRoutes)
  .use(paymentRoutes)
  .use(companyRoutes);

if (process.env.VERCEL !== "1") {
  app.listen(process.env.PORT || 3000, async ({ hostname, port }) => {
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
}

export type App = typeof app;
export { app };
