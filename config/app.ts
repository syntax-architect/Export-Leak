export const APP_CONFIG = {
  name: "ExportLeak",
  tagline: "Export Incentive & Payment Tracker",
  supportEmail: "support@exportleak.example",
  whatsappNumber: "+91 00000 00000",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
  defaultCurrency: "INR",
  dateFormatLabel: "DD MMM YYYY",
  url: process.env.NEXT_PUBLIC_APP_URL || "https://exportleak.in",
} as const;

export type AppConfig = typeof APP_CONFIG;
