export const UX_ANALYTICS_EVENT_NAME = "fieldgrid:ux-analytics";

export type UxAnalyticsSurface =
  | "navigation"
  | "objects"
  | "customers"
  | "personnel"
  | "assignments"
  | "planning"
  | "platform"
  | "auth";

export type UxAnalyticsEventInput =
  | {
      name: "search_submitted";
      surface: UxAnalyticsSurface;
      scope: "current_context" | "global";
      activeFilterCount: number;
    }
  | {
      name: "search_result_selected";
      surface: UxAnalyticsSurface;
      resultType: "route" | "entity_scope";
      positionBucket: "first" | "top_5" | "later" | "unknown";
    }
  | {
      name: "filter_changed";
      surface: UxAnalyticsSurface;
      action: "applied" | "cleared";
      activeFilterCount: number;
    }
  | {
      name: "saved_view_changed";
      surface: UxAnalyticsSurface;
      action: "saved" | "applied" | "deleted";
      activeFilterCount: number;
    }
  | {
      name: "form_progress";
      surface: UxAnalyticsSurface;
      form:
        | "object"
        | "customer"
        | "personnel"
        | "assignment"
        | "task_code"
        | "login";
      action: "started" | "completed" | "abandoned";
    }
  | {
      name: "mutation_error";
      surface: UxAnalyticsSurface;
      category:
        | "validation"
        | "permission"
        | "conflict"
        | "network"
        | "server"
        | "unknown";
    }
  | {
      name: "planboard_action";
      surface: "planning";
      action: "move" | "undo";
      input: "pointer" | "keyboard" | "touch";
      outcome: "success" | "rejected" | "rolled_back";
    }
  | {
      name: "command_palette";
      surface: "navigation";
      action: "opened" | "route_selected" | "scoped_search_selected";
      scope: "tenant" | "platform";
    };

export type UxAnalyticsEvent = UxAnalyticsEventInput & {
  schemaVersion: 1;
  occurredAt: string;
};

function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(99, Math.trunc(value)));
}

export function createUxAnalyticsEvent(
  input: UxAnalyticsEventInput,
  occurredAt = new Date(),
): UxAnalyticsEvent {
  const countFields =
    "activeFilterCount" in input
      ? { activeFilterCount: clampCount(input.activeFilterCount) }
      : {};
  return {
    ...input,
    ...countFields,
    schemaVersion: 1,
    occurredAt: occurredAt.toISOString(),
  } as UxAnalyticsEvent;
}

export function trackUxAnalytics(input: UxAnalyticsEventInput): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(UX_ANALYTICS_EVENT_NAME, {
      detail: createUxAnalyticsEvent(input),
    }),
  );
}
