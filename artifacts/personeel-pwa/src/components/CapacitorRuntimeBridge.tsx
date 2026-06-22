"use client";

import { useEffect } from "react";
import { isNativeCapacitorRuntime } from "@/lib/capacitor";

type ListenerHandle = {
  remove: () => Promise<void>;
};

export function CapacitorRuntimeBridge() {
  useEffect(() => {
    if (!isNativeCapacitorRuntime()) return;

    let mounted = true;
    let backButtonHandle: ListenerHandle | null = null;

    void import("@capacitor/status-bar")
      .then(({ StatusBar, Style }) =>
        Promise.allSettled([
          StatusBar.setBackgroundColor({ color: "#081D3A" }),
          StatusBar.setStyle({ style: Style.Light }),
        ]),
      )
      .catch(() => undefined);

    void import("@capacitor/splash-screen")
      .then(({ SplashScreen }) => SplashScreen.hide())
      .catch(() => undefined);

    void import("@capacitor/app")
      .then(async ({ App }) => {
        const handle = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack || window.history.length > 1) {
            window.history.back();
            return;
          }

          void App.exitApp();
        });

        if (!mounted) {
          await handle.remove();
          return;
        }

        backButtonHandle = handle;
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
      if (backButtonHandle) {
        void backButtonHandle.remove();
      }
    };
  }, []);

  return null;
}
