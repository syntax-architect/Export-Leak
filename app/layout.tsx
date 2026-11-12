import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { APP_CONFIG } from "@/config/app";
import { MotionProvider } from "@/lib/motion";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: `${APP_CONFIG.name} — ${APP_CONFIG.tagline}`,
    template: `%s | ${APP_CONFIG.name}`,
  },
  description:
    "Track export incentives (RoDTEP & Duty Drawback), FEMA realisation deadlines, IRM payment matching, and bulk eBRC exports.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-bg text-text antialiased">
        <ThemeProvider>
          <MotionProvider>
            <ToastProvider>{children}</ToastProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
