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

export default app.fetch;
