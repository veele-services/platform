import {
  configuredFieldgridCustomWebsiteRouteRegistry,
  customWebsiteHealthFailureCode,
  requestCustomWebsiteHealthEvidence,
  withCustomWebsiteHealthRefreshSession,
  type CustomWebsiteHealthRefreshCandidate,
  type CustomWebsiteHealthRefreshSession,
} from "@workspace/db";
import type {
  CustomWebsiteHealthEvidence,
  CustomWebsiteRouteRegistry,
  RoutableCustomWebsiteRouteRegistration,
} from "@workspace/website-core";
import { logger as defaultLogger } from "./logger";

export const CUSTOM_WEBSITE_HEALTH_REFRESH_INTERVAL_MS = 60_000;
export const CUSTOM_WEBSITE_HEALTH_REFRESH_BATCH_SIZE = 50;
export const CUSTOM_WEBSITE_HEALTH_REFRESH_CONCURRENCY = 10;
export const CUSTOM_WEBSITE_HEALTH_REFRESH_MAX_BATCHES = 4;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type RefresherEnvironment = Record<string, string | undefined> & {
  APP_ENV?: string;
  TARGET_ENVIRONMENT?: string;
  FIELDGRID_CUSTOM_WEBSITE_HEALTH_REFRESH_ENABLED?: string;
  FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID?: string;
  FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON?: string;
};

type RefresherLogger = {
  info: (obj: Record<string, unknown>, message?: string) => void;
  warn: (obj: Record<string, unknown>, message?: string) => void;
  error: (obj: Record<string, unknown>, message?: string) => void;
};

type RefreshSessionRunner = <T>(
  callback: (session: CustomWebsiteHealthRefreshSession) => Promise<T>,
) => Promise<{ acquired: false; result: null } | { acquired: true; result: T }>;

export type CustomWebsiteHealthRefresherConfig =
  | { enabled: false }
  | {
      enabled: true;
      actorUserId: string;
      registry: CustomWebsiteRouteRegistry;
    };

export type CustomWebsiteHealthRefreshCycleResult = {
  acquired: boolean;
  claimed: number;
  checked: number;
  healthy: number;
  failed: number;
  applied: number;
  superseded: number;
  recordErrors: number;
  backlog: boolean;
};

export type CustomWebsiteHealthRefresherStatus = {
  enabled: boolean;
  started: boolean;
  running: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastResult: CustomWebsiteHealthRefreshCycleResult | null;
};

type CycleDependencies = {
  withSession?: RefreshSessionRunner;
  checkEvidence?: typeof requestCustomWebsiteHealthEvidence;
};

type LifecycleDependencies = CycleDependencies & {
  environment?: RefresherEnvironment;
  logger?: RefresherLogger;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  now?: () => Date;
};

type Observation = {
  candidate: CustomWebsiteHealthRefreshCandidate;
  evidence: CustomWebsiteHealthEvidence | null;
  failureCode: string | null;
  cancelled: boolean;
};

export function customWebsiteHealthRefresherConfig(
  environment: RefresherEnvironment = process.env,
): CustomWebsiteHealthRefresherConfig {
  const enabledValue =
    environment.FIELDGRID_CUSTOM_WEBSITE_HEALTH_REFRESH_ENABLED?.trim();
  if (!enabledValue || enabledValue === "false") return { enabled: false };
  if (enabledValue !== "true") {
    throw new Error(
      "FIELDGRID_CUSTOM_WEBSITE_HEALTH_REFRESH_ENABLED must be true or false",
    );
  }
  if (
    environment.APP_ENV !== "staging" ||
    environment.TARGET_ENVIRONMENT !== "staging"
  ) {
    throw new Error(
      "Custom website health refresh can only run in the staging environment",
    );
  }
  const actorUserId =
    environment.FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID?.trim() ?? "";
  if (!UUID_PATTERN.test(actorUserId)) {
    throw new Error(
      "FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID must be a UUID when custom website health refresh is enabled",
    );
  }
  const registry = configuredFieldgridCustomWebsiteRouteRegistry(environment);
  if (
    !registry.registrations.some(
      (registration) => registration.status === "routable",
    )
  ) {
    throw new Error(
      "Custom website health refresh requires a routable staging registry",
    );
  }
  return { enabled: true, actorUserId, registry };
}

async function observeCandidate(
  candidate: CustomWebsiteHealthRefreshCandidate,
  registry: CustomWebsiteRouteRegistry,
  signal: AbortSignal,
  checkEvidence: typeof requestCustomWebsiteHealthEvidence,
): Promise<Observation> {
  const registration = registry.resolve(candidate.identity);
  if (!registration || registration.status !== "routable") {
    return {
      candidate,
      evidence: null,
      failureCode: "route_not_routable",
      cancelled: false,
    };
  }

  try {
    const evidence = await checkEvidence(
      registration as RoutableCustomWebsiteRouteRegistration,
      candidate.identity,
      { signal },
    );
    return { candidate, evidence, failureCode: null, cancelled: false };
  } catch (error) {
    const failureCode = customWebsiteHealthFailureCode(error);
    return {
      candidate,
      evidence: null,
      failureCode,
      cancelled: signal.aborted && failureCode === "aborted",
    };
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  callback: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        results[index] = await callback(values[index]!);
      }
    }),
  );
  return results;
}

export async function runCustomWebsiteHealthRefreshCycle(
  config: Extract<CustomWebsiteHealthRefresherConfig, { enabled: true }>,
  signal: AbortSignal,
  logger: RefresherLogger = defaultLogger,
  dependencies: CycleDependencies = {},
): Promise<CustomWebsiteHealthRefreshCycleResult> {
  const withSession =
    dependencies.withSession ?? withCustomWebsiteHealthRefreshSession;
  const checkEvidence =
    dependencies.checkEvidence ?? requestCustomWebsiteHealthEvidence;
  const initial: CustomWebsiteHealthRefreshCycleResult = {
    acquired: false,
    claimed: 0,
    checked: 0,
    healthy: 0,
    failed: 0,
    applied: 0,
    superseded: 0,
    recordErrors: 0,
    backlog: false,
  };

  const locked = await withSession(async (session) => {
    const result = { ...initial, acquired: true };
    for (
      let batchIndex = 0;
      batchIndex < CUSTOM_WEBSITE_HEALTH_REFRESH_MAX_BATCHES && !signal.aborted;
      batchIndex += 1
    ) {
      const candidates = await session.claim(
        CUSTOM_WEBSITE_HEALTH_REFRESH_BATCH_SIZE,
      );
      result.claimed += candidates.length;
      if (candidates.length === 0) break;

      const observations = await mapWithConcurrency(
        candidates,
        CUSTOM_WEBSITE_HEALTH_REFRESH_CONCURRENCY,
        (candidate) =>
          observeCandidate(candidate, config.registry, signal, checkEvidence),
      );

      for (const observation of observations) {
        if (observation.cancelled) continue;
        result.checked += 1;
        if (observation.evidence) result.healthy += 1;
        else result.failed += 1;
        try {
          const recorded = await session.record({
            candidate: observation.candidate,
            evidence: observation.evidence,
            failureCode: observation.failureCode,
            actorUserId: config.actorUserId,
          });
          if (recorded.applied) result.applied += 1;
          else result.superseded += 1;
        } catch {
          result.recordErrors += 1;
        }
      }

      if (candidates.length < CUSTOM_WEBSITE_HEALTH_REFRESH_BATCH_SIZE) break;
      if (batchIndex === CUSTOM_WEBSITE_HEALTH_REFRESH_MAX_BATCHES - 1) {
        result.backlog = true;
      }
    }
    return result;
  });

  if (!locked.acquired) return initial;
  const result = locked.result;
  if (result.failed > 0 || result.recordErrors > 0 || result.backlog) {
    logger.warn(
      {
        claimed: result.claimed,
        checked: result.checked,
        healthy: result.healthy,
        failed: result.failed,
        applied: result.applied,
        superseded: result.superseded,
        recordErrors: result.recordErrors,
        backlog: result.backlog,
      },
      "custom-website-health-refresher: cycle completed with failures",
    );
  } else {
    logger.info(
      {
        claimed: result.claimed,
        checked: result.checked,
        applied: result.applied,
      },
      "custom-website-health-refresher: cycle completed",
    );
  }
  return result;
}

export function createCustomWebsiteHealthRefresher(
  dependencies: LifecycleDependencies = {},
) {
  const environment = dependencies.environment ?? process.env;
  const logger = dependencies.logger ?? defaultLogger;
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  const now = dependencies.now ?? (() => new Date());
  const config = customWebsiteHealthRefresherConfig(environment);
  const status: CustomWebsiteHealthRefresherStatus = {
    enabled: config.enabled,
    started: false,
    running: false,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastResult: null,
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let currentRun: Promise<void> | null = null;

  const schedule = (delayMs: number) => {
    if (!status.started || !config.enabled) return;
    timer = setTimer(() => {
      timer = null;
      void runAndSchedule();
    }, delayMs);
    timer.unref?.();
  };

  const runAndSchedule = async (): Promise<void> => {
    if (!status.started || !config.enabled || currentRun) return;
    controller = new AbortController();
    status.running = true;
    status.lastStartedAt = now().toISOString();
    currentRun = (async () => {
      try {
        status.lastResult = await runCustomWebsiteHealthRefreshCycle(
          config,
          controller!.signal,
          logger,
          dependencies,
        );
      } catch {
        logger.error(
          { code: "refresh_cycle_failed" },
          "custom-website-health-refresher: cycle failed",
        );
      } finally {
        status.running = false;
        status.lastCompletedAt = now().toISOString();
      }
    })();
    await currentRun;
    currentRun = null;
    controller = null;
    schedule(
      status.lastResult?.backlog
        ? 1_000
        : CUSTOM_WEBSITE_HEALTH_REFRESH_INTERVAL_MS,
    );
  };

  return {
    start(): void {
      if (status.started) return;
      status.started = true;
      if (!config.enabled) {
        logger.info(
          { enabled: false },
          "custom-website-health-refresher: disabled",
        );
        return;
      }
      void runAndSchedule();
    },
    async stop(): Promise<void> {
      status.started = false;
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
      controller?.abort();
      await currentRun;
    },
    getStatus(): CustomWebsiteHealthRefresherStatus {
      return {
        ...status,
        lastResult: status.lastResult ? { ...status.lastResult } : null,
      };
    },
  };
}
