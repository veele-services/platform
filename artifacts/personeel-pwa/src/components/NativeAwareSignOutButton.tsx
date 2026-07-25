"use client";

import {
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";

import { signOut } from "@/actions/auth";
import { deactivateMyNativePushToken } from "@/actions/push";
import { isNativeCapacitorRuntime } from "@/lib/capacitor";
import {
  getLocalNativePushState,
  unregisterNativePush,
} from "@/lib/native-push";

type NativeAwareSignOutButtonProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  role?: string;
};

export function NativeAwareSignOutButton({
  children,
  className,
  style,
  role,
}: NativeAwareSignOutButtonProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        role={role}
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              if (isNativeCapacitorRuntime()) {
                const state = await getLocalNativePushState();
                if (state.supported && state.token) {
                  await deactivateMyNativePushToken(state.token).catch(
                    () => undefined,
                  );
                }
                await unregisterNativePush();
              }
              await signOut();
            } catch {
              setError(
                "Uitloggen is niet gelukt. Controleer je verbinding en probeer opnieuw.",
              );
            }
          });
        }}
      >
        {pending ? "Uitloggen…" : children}
      </button>
      {error ? (
        <p className="mt-2 text-xs font-semibold text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
