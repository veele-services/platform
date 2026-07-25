"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  trackUxAnalytics,
  type UxAnalyticsForm,
  type UxAnalyticsSurface,
  type UxMutationErrorCategory,
} from "@/lib/ux-analytics";

export function useUxFormAnalytics(
  surface: UxAnalyticsSurface,
  form: UxAnalyticsForm,
) {
  const started = useRef(false);
  const completed = useRef(false);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    trackUxAnalytics({
      name: "form_progress",
      surface,
      form,
      action: "started",
    });
  }, [form, surface]);

  const complete = useCallback(() => {
    if (completed.current) return;
    if (!started.current) start();
    completed.current = true;
    trackUxAnalytics({
      name: "form_progress",
      surface,
      form,
      action: "completed",
    });
  }, [form, start, surface]);

  const mutationError = useCallback(
    (category: UxMutationErrorCategory) => {
      trackUxAnalytics({
        name: "mutation_error",
        surface,
        category,
      });
    },
    [surface],
  );

  useEffect(
    () => () => {
      if (!started.current || completed.current) return;
      trackUxAnalytics({
        name: "form_progress",
        surface,
        form,
        action: "abandoned",
      });
    },
    [form, surface],
  );

  return {
    start,
    complete,
    mutationError,
  };
}
