"use client";

import { useEffect } from "react";

function isOfflineContentPath(pathname: string): boolean {
  if (pathname.startsWith("/klant/help/media/") || pathname.startsWith("/klant/releases/media/")) return false;
  return (
    pathname === "/klant/help" ||
    pathname === "/klant/releases" ||
    /^\/klant\/help\/[^/]+$/.test(pathname) ||
    /^\/klant\/releases\/[^/]+$/.test(pathname)
  );
}

export function OfflineContentNavigation() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (navigator.onLine) return;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;

      if (!isOfflineContentPath(url.pathname)) return;

      event.preventDefault();
      window.location.assign(url.href);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
