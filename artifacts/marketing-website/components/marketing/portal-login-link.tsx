"use client";

import Link from "next/link";
import { forwardRef, type ComponentPropsWithoutRef, type MouseEvent } from "react";

type PortalLoginLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, "href" | "prefetch">;

export const PortalLoginLink = forwardRef<HTMLAnchorElement, PortalLoginLinkProps>(function PortalLoginLink(
  { onClick, target, ...props },
  ref,
) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (target && target !== "_self")
    ) {
      return;
    }

    event.preventDefault();
    window.location.assign(event.currentTarget.href);
  }

  return (
    <Link
      {...props}
      ref={ref}
      href="/klant/login"
      target={target}
      prefetch={false}
      data-document-navigation="true"
      onClick={handleClick}
    />
  );
});
