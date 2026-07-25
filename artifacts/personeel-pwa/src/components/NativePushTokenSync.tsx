"use client";

import { useEffect } from "react";
import { saveMyNativePushToken } from "@/actions/push";
import { isNativeCapacitorRuntime } from "@/lib/capacitor";
import {
  getLocalNativePushState,
  getNativePushAppMetadata,
} from "@/lib/native-push";

export function NativePushTokenSync({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !isNativeCapacitorRuntime()) return;

    let cancelled = false;

    getLocalNativePushState()
      .then(async (state) => {
        if (cancelled || !state.supported || !state.token) return;

        const metadata = await getNativePushAppMetadata();
        if (!metadata) return;

        await saveMyNativePushToken({
          token: state.token,
          platform: state.platform,
          appId: metadata.appId,
          appVersion: metadata.appVersion,
          appBuild: metadata.appBuild,
          userAgent: navigator.userAgent,
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return null;
}
