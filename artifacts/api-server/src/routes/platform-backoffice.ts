import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function backofficeOrigin(): string | null {
  const explicit = process.env["BACKOFFICE_INTERNAL_URL"] ?? process.env["FIELDGRID_BACKOFFICE_INTERNAL_URL"];
  if (explicit) return trimTrailingSlash(explicit);

  const port = process.env["BACKOFFICE_PORT"];
  if (!port) return null;

  return `http://127.0.0.1:${port}`;
}

function forwardedHeaders(req: Request): Headers {
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    const normalizedName = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedName) || normalizedName === "host") {
      continue;
    }

    if (Array.isArray(value)) {
      headers.set(name, value.join(", "));
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  if (host && !headers.has("x-forwarded-host")) {
    headers.set("x-forwarded-host", Array.isArray(host) ? (host[0] ?? "") : host);
  }

  if (!headers.has("x-forwarded-proto")) {
    headers.set("x-forwarded-proto", req.protocol === "https" ? "https" : "http");
  }

  return headers;
}

function setResponseHeaders(res: Response, headers: Headers): void {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(headers) : [];

  for (const [name, value] of headers.entries()) {
    const normalizedName = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedName) || normalizedName === "set-cookie") {
      continue;
    }

    res.setHeader(name, value);
  }

  if (setCookies.length > 0) {
    res.setHeader("set-cookie", setCookies);
  }
}

router.use("/platform", async (req, res): Promise<void> => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).json({ error: "Platform API ondersteunt alleen read-only verzoeken via deze route" });
    return;
  }

  const origin = backofficeOrigin();
  if (!origin) {
    req.log.error("BACKOFFICE_INTERNAL_URL or BACKOFFICE_PORT is required for platform API pass-through");
    res.status(502).json({ error: "Platform API upstream niet geconfigureerd" });
    return;
  }

  const upstreamUrl = new URL(req.originalUrl, `${origin}/`);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: forwardedHeaders(req),
      redirect: "manual",
    });

    res.status(upstream.status);
    setResponseHeaders(res, upstream.headers);

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    req.log.error({ err, upstreamUrl: upstreamUrl.toString() }, "Platform API pass-through failed");
    res.status(502).json({ error: "Platform API upstream niet bereikbaar" });
  }
});

export default router;
