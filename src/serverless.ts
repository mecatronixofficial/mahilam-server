import type { Request, Response } from "express";
import { createApp } from "./app.factory.js";

type Handler = (req: Request, res: Response) => void;

/** One Nest app per function instance: created on the first (cold) request and reused while the instance stays warm. */
let server: Promise<Handler> | undefined;

async function boot(): Promise<Handler> {
  const app = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance();
}

/** Vercel entry point (see api/index.js). */
export default async function handler(req: Request, res: Response) {
  server ??= boot().catch((error) => {
    server = undefined; // let the next request retry instead of caching the failure
    throw error;
  });
  (await server)(req, res);
}
