import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "../db";

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    async sendResetPassword({ user, url }) {
      await resend.emails.send({
        from: "onboarding@resend.dev",
        to: user.email,
        subject: "Reset your Netherium Password",
        html: `
              <h1>Reset Your Password</h1>
              <p>Click the link below to reset your password. This link expires in 1 hour.</p>
              <a href="${url}" style="padding: 10px 20px; background-color: black; color: white; text-decoration: none; border-radius: 5px;">
                Reset Password
              </a>
              <p>If you didn't request this, please ignore this email.</p>
            `,
      });
    },
  },
  emailVerification: {
    async sendVerificationEmail({ user, url }) {
      await resend.emails.send({
        from: "onboarding@resend.dev",
        to: user.email,
        subject: "Verify your email address",
        html: `
                  <h1>Welcome to Netherium!</h1>
                  <p>Please verify your email address by clicking the link below.</p>
                  <a href="${url}" style="padding: 10px 20px; background-color: black; color: white; text-decoration: none; border-radius: 5px;">
                    Verify Email
                  </a>
                  <p>If you didn't sign up, please ignore this email.</p>
                `,
      });
      console.log(`Verification email sent to ${user.email}`);
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  baseURL: `${process.env.SERVER_URL}`,
  trustedOrigins: [
    process.env.CLIENT_WEBSITE_URL!,
    "https://*.vercel.app"
  ],
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },
});
