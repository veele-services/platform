"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { getCapacitorPlatform, isNativeCapacitorRuntime } from "@/lib/capacitor";
import {
  ensureNativePushRegistration,
  getLocalNativePushState,
  type NativePushRegistration,
} from "@/lib/native-push";

type CheckValue = string | boolean | number | null;

type RuntimeSnapshot = {
  timestamp: string;
  userAgent: string;
  hasWindowCapacitor: boolean;
  platform: string;
  isNativePlatform: boolean;
  nativeRuntimeDetected: boolean;
  pluginKeys: string[];
  hasPushPluginOnWindow: boolean;
  nativePushState: string;
  localTokenPreview: string | null;
};

function readWindowCapacitor() {
  if (typeof window === "undefined") return null;
  return (window as typeof window & { Capacitor?: unknown }).Capacitor as
    | {
        getPlatform?: () => string;
        isNativePlatform?: () => boolean;
        Plugins?: Record<string, unknown>;
      }
    | undefined;
}

function previewToken(token: string | null) {
  if (!token) return null;
  if (token.length <= 18) return token;
  return `${token.slice(0, 10)}...${token.slice(-8)}`;
}

function valueLabel(value: CheckValue) {
  if (typeof value === "boolean") return value ? "Ja" : "Nee";
  if (value === null || value === "") return "-";
  return String(value);
}

export function NativeDebugPanel() {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [registration, setRegistration] = useState<NativePushRegistration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const rows = useMemo(
    () =>
      snapshot
        ? [
            ["Capacitor bridge aanwezig", snapshot.hasWindowCapacitor],
            ["Platform", snapshot.platform],
            ["Native platform volgens Capacitor", snapshot.isNativePlatform],
            ["Native runtime volgens app", snapshot.nativeRuntimeDetected],
            ["Push plugin op window", snapshot.hasPushPluginOnWindow],
            ["Plugin keys", snapshot.pluginKeys.join(", ") || "-"],
            ["Native push status", snapshot.nativePushState],
            ["Lokale token", snapshot.localTokenPreview],
            ["User agent", snapshot.userAgent],
            ["Laatste check", snapshot.timestamp],
          ] satisfies Array<[string, CheckValue]>,
        : [],
    [snapshot],
  );

  function refresh() {
    setError(null);
    startTransition(async () => {
      const bridge = readWindowCapacitor();
      const pluginKeys = Object.keys(bridge?.Plugins ?? {}).sort();
      const localState = await getLocalNativePushState().catch((caught: unknown) => ({
        supported: false as const,
        reason: caught instanceof Error ? caught.message : "Native push status kon niet worden gelezen.",
      }));

      setSnapshot({
        timestamp: new Date().toLocaleString("nl-NL"),
        userAgent: navigator.userAgent,
        hasWindowCapacitor: Boolean(bridge),
        platform: bridge?.getPlatform?.() ?? getCapacitorPlatform(),
        isNativePlatform: bridge?.isNativePlatform?.() ?? false,
        nativeRuntimeDetected: isNativeCapacitorRuntime(),
        pluginKeys,
        hasPushPluginOnWindow: Boolean(bridge?.Plugins?.PushNotifications),
        nativePushState: localState.supported
          ? `${localState.permission} (${localState.platform})`
          : localState.reason,
        localTokenPreview: localState.supported ? previewToken(localState.token) : null,
      });
    });
  }

  function testRegistration() {
    setError(null);
    setRegistration(null);
    startTransition(async () => {
      try {
        const result = await ensureNativePushRegistration();
        setRegistration(result);
        refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Native push registratie mislukt.");
      }
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.11)]">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
            <Smartphone size={21} strokeWidth={2.4} />
          </span>
          <div>
            <h2 className="text-lg font-black text-[#081D3A]">Native runtime</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Controleert of de Capacitor bridge en pushplugin zichtbaar zijn in de app.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5"
            >
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                {label}
              </p>
              <p className="mt-1 break-words text-sm font-bold text-[#081D3A]">
                {valueLabel(value)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={refresh}
            disabled={isPending}
            className="flex items-center justify-center gap-2 rounded-2xl border border-[#BDEDEA] bg-white px-4 py-3 text-sm font-black text-[#081D3A] shadow-sm disabled:opacity-60"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            Opnieuw controleren
          </button>
          <button
            type="button"
            onClick={testRegistration}
            disabled={isPending}
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#00B7B3] px-4 py-3 text-sm font-black text-white shadow-sm disabled:opacity-60"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            Pushregistratie testen
          </button>
        </div>
      </section>

      {registration ? (
        <section className="rounded-[22px] border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          FCM-token ontvangen: {previewToken(registration.token)} ({registration.platform})
        </section>
      ) : null}

      {error ? (
        <section className="flex gap-3 rounded-[22px] border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          <AlertTriangle size={19} className="shrink-0" />
          <span>{error}</span>
        </section>
      ) : null}
    </div>
  );
}
