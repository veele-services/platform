import "server-only";

export const PLANNING_DAY_MAP_FEATURE_KEY = "planning_day_map_enabled";
export const PLANNING_DAY_MAP_ENV_VAR = "FIELDGRID_PLANNING_DAY_MAP_ENABLED";
export const PLANNING_DAY_MAP_ENABLED_BY_DEFAULT = false;

const truthyValues = new Set(["1", "true", "yes", "on", "enabled"]);

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
  return configuredValue ? truthyValues.has(configuredValue) : PLANNING_DAY_MAP_ENABLED_BY_DEFAULT;
}
