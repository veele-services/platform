import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { runtimeHealthHeaders } from "@workspace/db/runtime-health-identity";

const router: IRouter = Router();
const identityHeaders = runtimeHealthHeaders("api");

// The uncredentialed API root continues into requireAuth and returns its 401.
// Bind both that response and healthz to this process without changing their bodies.
router.use((req, res, next) => {
  if ((req.method === "GET" || req.method === "HEAD") && (req.path === "/" || req.path === "/healthz")) {
    res.set(identityHeaders);
  }
  next();
});

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
