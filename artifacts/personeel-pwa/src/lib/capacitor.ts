"use client";

type CapacitorBridge = {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
};

function getBridge(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  const maybeWindow = window as typeof window & {
    Capacitor?: CapacitorBridge;
  };
  return maybeWindow.Capacitor ?? null;
}

export function isNativeCapacitorRuntime() {
  const bridge = getBridge();
  if (!bridge) return false;

  if (typeof bridge.isNativePlatform === "function") {
    return bridge.isNativePlatform();
  }

  if (typeof bridge.getPlatform === "function") {
    return bridge.getPlatform() !== "web";
  }

  return false;
}

export function getCapacitorPlatform() {
  const bridge = getBridge();
  return bridge?.getPlatform?.() ?? "web";
}
