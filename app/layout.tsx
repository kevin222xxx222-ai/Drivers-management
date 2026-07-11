import "./globals.css";
import type { Metadata, Viewport } from "next";
import AppSplashScreen from "@/components/AppSplashScreen";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "ドライバー業務管理",
  description: "Google非依存のドライバー業務管理Webアプリ",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "運行管理",
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
