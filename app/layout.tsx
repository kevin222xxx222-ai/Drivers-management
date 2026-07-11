import "./globals.css";
import type { Metadata, Viewport } from "next";
import AppSplashScreen from "@/components/AppSplashScreen";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "WOMANS GROUP Driver Management System",
  description: "WOMANS GROUP社内利用専用のDriver Management Systemです。",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }, { url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png"
  },
  appleWebApp: {
    capable: true,
    title: "WOMANS GROUP",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#102033"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AppSplashScreen />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
