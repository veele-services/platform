"use client";

import { useEffect, useState } from "react";

export function PwaSplashScreen({
  splashUrl,
  backgroundColor,
}: {
  splashUrl: string | null | undefined;
  backgroundColor: string;
}) {
  const [visible, setVisible] = useState(Boolean(splashUrl));

  useEffect(() => {
    if (!splashUrl) return;

    const hide = window.setTimeout(() => setVisible(false), 1100);
    const maxWait = window.setTimeout(() => setVisible(false), 2200);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(maxWait);
    };
  }, [splashUrl]);

  if (!splashUrl || !visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9999] flex items-stretch justify-stretch"
      style={{ backgroundColor }}
    >
      <img src={splashUrl} alt="" className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}
