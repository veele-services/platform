"use client";

import { useEffect } from "react";

import { getNativeAppInfo, isNativeCapacitorRuntime } from "@/lib/capacitor";
import { resolvePersonnelNativeUrl } from "@/lib/native-navigation";

type ListenerHandle = {
  remove: () => Promise<void>;
};

async function navigateToTrustedNativeUrl(rawUrl: string) {
  const info = await getNativeAppInfo();
  if (!info) return;
  const trustedUrl = resolvePersonnelNativeUrl(rawUrl, info.id);
  if (!trustedUrl || trustedUrl === window.location.href) return;
  window.location.assign(trustedUrl);
}

export function CapacitorRuntimeBridge() {
  useEffect(() => {
    if (!isNativeCapacitorRuntime()) return;

    let mounted = true;
    const handles: ListenerHandle[] = [];

    function keepHandle(handle: ListenerHandle) {
      if (!mounted) {
        void handle.remove();
        return;
      }
      handles.push(handle);
    }

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
        const [backButtonHandle, appUrlHandle] = await Promise.all([
          App.addListener("backButton", ({ canGoBack }) => {
            if (canGoBack || window.history.length > 1) {
              window.history.back();
              return;
            }
            void App.exitApp();
          }),
          App.addListener("appUrlOpen", ({ url }) => {
            void navigateToTrustedNativeUrl(url);
          }),
        ]);

        keepHandle(backButtonHandle);
        keepHandle(appUrlHandle);

        const launch = await App.getLaunchUrl();
        if (launch?.url) {
          await navigateToTrustedNativeUrl(launch.url);
        }
      })
      .catch(() => undefined);

    void import("@capacitor/push-notifications")
      .then(async ({ PushNotifications }) => {
        const handle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          ({ notification }) => {
            const href = notification.data?.["href"];
            if (typeof href === "string") {
              void navigateToTrustedNativeUrl(href);
            }
          },
        );
        keepHandle(handle);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
      for (const handle of handles) {
        void handle.remove();
      }
    };
  }, []);

  return null;
}
