import cors from "cors";
import express from "express";
import { authenticateRequest } from "./auth.js";
import { errorHandler } from "./http-errors.js";
import type { WorkerDependencies } from "./types.js";

export function createApp(deps: WorkerDependencies): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "bharatdoc-worker"
    });
  });

  app.get("/api/me", async (req, res, next) => {
    try {
      const auth = await authenticateRequest(req, deps);
      res.json({
        doctor: auth.doctor
      });
    } catch (error) {
      next(error);
    }
  });

  app.use(errorHandler);

  return app;
}
