"use client";

import {
  forwardRef,
  useState,
  useTransition,
  type ButtonHTMLAttributes,
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

type NativeAwareSignOutButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "className" | "style"
> & {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  menuItem?: boolean;
};

export const NativeAwareSignOutButton = forwardRef<
  HTMLButtonElement,
  NativeAwareSignOutButtonProps
>(function NativeAwareSignOutButton(
  {
    children,
    className,
    style,
    menuItem = false,
    onClick,
    ...buttonProps
  },
  ref,
) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const button = (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      className={className}
      style={style}
      disabled={pending || buttonProps.disabled}
      aria-busy={pending}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
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
      {pending
        ? "Uitloggen…"
        : menuItem && error
          ? "Uitloggen mislukt — probeer opnieuw"
          : children}
    </button>
  );

  if (menuItem) return button;

  return (
    <>
      {button}
      {error ? (
        <p className="mt-2 text-xs font-semibold text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
});
