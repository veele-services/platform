"use client";

import { useEffect } from "react";
import { saveMyNativePushToken } from "@/actions/push";
import { isNativeCapacitorRuntime } from "@/lib/capacitor";
import { getLocalNativePushState } from "@/lib/native-push";

export function NativePushTokenSync() {
  useEffect(() => {
    if (!isNativeCapacitorRuntime()) return;

    let cancelled = false;

    getLocalNativePushState()
      .then(async (state) => {
        if (cancelled || !state.supported || !state.token) return;

        await saveMyNativePushToken({
          token: state.token,
          platform: state.platform,
          appId: "nl.veeleservices.personeel",
          userAgent: navigator.userAgent,
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
