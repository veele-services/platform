import type { Request, Response } from "express";

export type NotificationWorkerChannel = "email" | "push";

export function requireAdminSecret(
  req: Request,
  res: Response,
  scope: string,
): boolean {
  const expectedSecret = process.env["ADMIN_API_SECRET"];
  if (!expectedSecret) {
    req.log.error(`${scope}: ADMIN_API_SECRET niet geconfigureerd`);
    res.status(503).json({ error: "Route niet beschikbaar" });
    return false;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expectedSecret) {
    req.log.warn({ ip: req.ip }, `${scope}: ongeldige admin token`);
    res.status(401).json({ error: "Ongeautoriseerd" });
    return false;
  }

  return true;
}

export function parsePositiveInt(
  value: unknown,
  fallback: number,
  max: number,
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function parseNotificationWorkerChannels(
  value: unknown,
): NotificationWorkerChannel[] {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw ?? "all")
    .trim()
    .toLowerCase();

  if (!text || text === "all") return ["email", "push"];

  const channels = text
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is NotificationWorkerChannel =>
      item === "email" || item === "push",
    );

  return channels.length > 0 ? [...new Set(channels)] : ["email", "push"];
}
