"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type CopySupportLinkButtonProps = {
  value: string;
  label?: string;
  copiedLabel?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
};

export function CopySupportLinkButton({
  value,
  label = "Supportlink kopieren",
  copiedLabel = "Gekopieerd",
  variant = "outline",
  size = "sm",
}: CopySupportLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const Icon = copied ? Check : Copy;

  async function copyLink() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <Button type="button" variant={variant} size={size} className="gap-2" onClick={copyLink}>
      <Icon className="h-4 w-4" />
      {copied ? copiedLabel : label}
    </Button>
  );
}
