import { Router, type IRouter } from "express";
import { isCustomDomainAllowedForCaddy, normalizeHost } from "@workspace/db";

const router: IRouter = Router();

router.get("/internal/caddy/ask-domain", async (req, res) => {
  const queryDomain = Array.isArray(req.query.domain) ? req.query.domain[0] : req.query.domain;
  const domain = typeof queryDomain === "string" ? normalizeHost(queryDomain) : "";

  res.setHeader("Cache-Control", "no-store");

  if (!domain) {
    res.status(403).end();
    return;
  }

  try {
    const allowed = await isCustomDomainAllowedForCaddy(domain);
    res.status(allowed ? 200 : 403).end();
  } catch (err) {
    req.log.warn({ err, domain }, "Caddy custom-domain allow check failed");
    res.status(403).end();
  }
});

export default router;
