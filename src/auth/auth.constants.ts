import type { CookieOptions } from "express";

export function authCookieNames() {
  const prefix = process.env.NODE_ENV === "production" ? "__Host-" : "";
  return { access: `${prefix}lm_access_token`, refresh: `${prefix}lm_refresh_token` };
}

export function authCookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" };
}
