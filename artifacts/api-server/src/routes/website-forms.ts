import { Router, type Request, type Response } from "express";
import { PublicWebsiteFormError, submitPublicWebsiteForm } from "@workspace/db";
import {
  WEBSITE_FORM_FIELD_KEYS,
  type WebsiteFormSubmissionData,
} from "@workspace/website-core/forms";
import { normalizeWebsiteRequestHost } from "@workspace/website-core/shared-host-routing";

const router = Router();
const MAX_BODY_BYTES = 32 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function wantsJson(req: Request): boolean {
  return (
    Boolean(req.is("application/json")) ||
    req.accepts(["json", "html"]) === "json"
  );
}

function bodySize(req: Request): number {
  return req.rawBody?.byteLength ?? 0;
}

function sameOriginRequest(req: Request, requestHost: string): boolean {
  if (req.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.get("origin");
  if (!origin) return true;
  try {
    return normalizeWebsiteRequestHost(new URL(origin).host) === requestHost;
  } catch {
    return false;
  }
}

function formDataFromBody(
  body: Record<string, unknown>,
): WebsiteFormSubmissionData | Record<string, unknown> {
  if (isRecord(body.data)) return body.data;
  return Object.fromEntries(
    WEBSITE_FORM_FIELD_KEYS.flatMap((key) => {
      const value = body[key];
      return typeof value === "string" ? [[key, value]] : [];
    }),
  );
}

function safeReturnPath(
  req: Request,
  body: Record<string, unknown>,
  requestHost: string,
): string {
  const submitted =
    typeof body._returnPath === "string" ? body._returnPath.trim() : "";
  if (
    submitted.startsWith("/") &&
    !submitted.startsWith("//") &&
    !/[\u0000-\u001f\u007f]/u.test(submitted) &&
    submitted.length <= 500
  ) {
    return submitted.split("?")[0] || "/";
  }
  const referer = req.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (
        normalizeWebsiteRequestHost(url.host) === requestHost &&
        url.pathname.startsWith("/") &&
        !url.pathname.startsWith("//")
      ) {
        return url.pathname;
      }
    } catch {
      // Fall through to the tenant-domain root.
    }
  }
  return "/";
}

function redirectWithState(
  res: Response,
  path: string,
  state: "verzonden" | "fout" | "later",
): void {
  const url = new URL(path, "https://fieldgrid.invalid");
  url.searchParams.set("formulier", state);
  res.redirect(303, `${url.pathname}${url.search}`);
}

router.post(
  "/website-forms/:formId/submissions",
  async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const requestHost = normalizeWebsiteRequestHost(req.get("host") ?? "");
    const body = isRecord(req.body) ? req.body : {};
    const json = wantsJson(req);
    const returnPath = safeReturnPath(req, body, requestHost ?? "");

    if (!requestHost) {
      if (json) {
        res.status(404).json({ accepted: false, code: "not_found" });
      } else {
        redirectWithState(res, "/", "fout");
      }
      return;
    }
    if (bodySize(req) > MAX_BODY_BYTES) {
      if (json) {
        res.status(413).json({ accepted: false, code: "too_large" });
      } else {
        redirectWithState(res, returnPath, "fout");
      }
      return;
    }
    if (!sameOriginRequest(req, requestHost)) {
      if (json) {
        res.status(400).json({ accepted: false, code: "invalid" });
      } else {
        redirectWithState(res, returnPath, "fout");
      }
      return;
    }

    try {
      const result = await submitPublicWebsiteForm({
        host: requestHost,
        formId: Array.isArray(req.params.formId)
          ? (req.params.formId[0] ?? "")
          : (req.params.formId ?? ""),
        data: formDataFromBody(body),
        idempotencyKey:
          req.get("idempotency-key") ??
          (typeof body._submissionId === "string"
            ? body._submissionId
            : undefined),
        networkSignal: req.ip || "unknown-network",
        userAgent: req.get("user-agent") ?? "",
        honeypot:
          typeof body._companyWebsite === "string" ? body._companyWebsite : "",
      });
      if (json) {
        res.status(202).json(result);
      } else {
        redirectWithState(res, returnPath, "verzonden");
      }
    } catch (error) {
      const publicError =
        error instanceof PublicWebsiteFormError
          ? error
          : new PublicWebsiteFormError(
              503,
              "unavailable",
              "Websiteformulier tijdelijk niet beschikbaar",
            );
      if (json) {
        res.status(publicError.statusCode).json({
          accepted: false,
          code: publicError.publicCode,
        });
      } else {
        redirectWithState(
          res,
          returnPath,
          publicError.statusCode === 429 ? "later" : "fout",
        );
      }
    }
  },
);

export default router;
