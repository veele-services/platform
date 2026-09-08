import { createHash, timingSafeEqual } from "node:crypto";

export type StagingSmokeAutomationAuth = "absent" | "valid" | "invalid";

const MAX_AUTHORIZATION_LENGTH = 8_256;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function classifyStagingSmokeAutomationBearer(
  request: Request,
  configuredSecret = process.env.ADMIN_API_SECRET,
  environment = process.env,
): StagingSmokeAutomationAuth {
  const authorization = request.headers.get("authorization");
  if (authorization === null) return "absent";

  const match = /^Bearer ([^\s,]+)$/u.exec(authorization);
  const presented = match?.[1] ?? "";
  if (
    environment.APP_ENV !== "staging" ||
    environment.TARGET_ENVIRONMENT !== "staging" ||
    typeof configuredSecret !== "string" ||
    configuredSecret.length < 32 ||
    presented.length === 0 ||
    presented.length > MAX_AUTHORIZATION_LENGTH
  ) {
    return "invalid";
  }

  return timingSafeEqual(digest(presented), digest(configuredSecret))
    ? "valid"
    : "invalid";
}
