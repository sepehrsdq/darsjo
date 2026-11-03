import type { Metadata, Viewport } from "next";
import "@fontsource-variable/vazirmatn/wght.css";
import "@fontsource/lalezar/400.css";
import "./globals.css";
import { MotionProvider } from "@/components/MotionProvider";

export const metadata: Metadata = {
  title: "کلاس من — دبستان مهر",
  description: "سامانهٔ کلاس‌های مجازی دبستان مهر: درس‌ها، کلاس‌ها و ضبط جلسه‌ها",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
