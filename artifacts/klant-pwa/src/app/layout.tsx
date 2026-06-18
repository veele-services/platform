import type { Metadata, Viewport } from "next";
import { DevNav } from "@/components/DevNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veele Klantportaal",
  description: "Veele Services — portaal voor klanten",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Veele",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#081D3A",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body>
        <DevNav current="klant" />
        {children}
      </body>
    </html>
  );
}
