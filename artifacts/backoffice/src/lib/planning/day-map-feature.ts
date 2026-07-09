import "server-only";

export const PLANNING_DAY_MAP_FEATURE_KEY = "planning_day_map_enabled";
export const PLANNING_DAY_MAP_ENV_VAR = "FIELDGRID_PLANNING_DAY_MAP_ENABLED";
export const PLANNING_DAY_MAP_ENABLED_BY_DEFAULT = false;

const truthyValues = new Set(["1", "true", "yes", "on", "enabled"]);
const betaEnvironmentValues = new Set(["staging", "preview", "beta"]);

export const planningDayMapFeature = {
  key: PLANNING_DAY_MAP_FEATURE_KEY,
  envVar: PLANNING_DAY_MAP_ENV_VAR,
  enabledByDefault: PLANNING_DAY_MAP_ENABLED_BY_DEFAULT,
  runtime: "server-only",
} as const;

export function isPlanningDayMapEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configuredValue = env[PLANNING_DAY_MAP_ENV_VAR]?.trim().toLowerCase();
  if (configuredValue) return truthyValues.has(configuredValue);

  const appEnv = env.APP_ENV?.trim().toLowerCase();
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();
  const fieldgridEnv = env.FIELDGRID_ENV?.trim().toLowerCase();
  return (
    PLANNING_DAY_MAP_ENABLED_BY_DEFAULT ||
    betaEnvironmentValues.has(appEnv ?? "") ||
    betaEnvironmentValues.has(vercelEnv ?? "") ||
    betaEnvironmentValues.has(fieldgridEnv ?? "")
  );
}
