import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { DevNav } from "@/components/DevNav";
import "./globals.css";

const fontVariables = "font-sans";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "Fieldgrid",
    template: "%s - Fieldgrid",
  },
  description: "Fieldgrid managementplatform voor operations, planning en rapportage.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={fontVariables}>
        <DevNav current="backoffice" />
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
