import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { auth } from "./api/auth";
import { dts } from "elysia-remote-dts";
import { paymentRoutes } from "./api/payment";
import { companyRoutes } from "./api/company";
import { meRoutes } from "./api/me";

const app = new Elysia()
// export default new Elysia() 
  .use(
    cors({
      origin: true,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    }),
  )
  .options("*", () => new Response(null, { status: 204 }))
  .get("/health", () => ({
    status: "ok",
    runtime: "vercel",
    timestamp: new Date().toISOString(),
  }))
  .mount(auth.handler)
  .use(dts("./src/index.ts"))
  .use(meRoutes)
  .use(paymentRoutes)
  .use(companyRoutes)
  .listen(process.env.PORT || 3000, async ({ hostname, port }) => {
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
