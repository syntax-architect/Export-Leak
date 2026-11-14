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
  metadataBase: new URL(APP_CONFIG.url || "https://exportleak.in"),
  title: {
    default: `${APP_CONFIG.name} — ${APP_CONFIG.tagline}`,
    template: `%s | ${APP_CONFIG.name}`,
  },
  description:
    "Track export incentives (RoDTEP & Duty Drawback), FEMA realisation deadlines, IRM payment matching, and bulk eBRC exports.",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: APP_CONFIG.url,
    siteName: APP_CONFIG.name,
    title: `${APP_CONFIG.name} — Export Incentive & eBRC Tracker`,
    description:
      "Find unclaimed RoDTEP/Drawback export incentives and generate DGFT-compliant bulk eBRC spreadsheets.",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_CONFIG.name} — Export Incentive & eBRC Tracker`,
    description:
      "Find unclaimed RoDTEP/Drawback export incentives and generate DGFT-compliant bulk eBRC spreadsheets.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: APP_CONFIG.name,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "INR",
  },
  description:
    "Reconciliation software for Indian exporters and EXIM consultants to track RoDTEP incentives, FEMA 9-month realisation deadlines, and generate DGFT bulk eBRC Excel files.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
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
