import type { MetadataRoute } from "next";
import { APP_CONFIG } from "@/config/app";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_CONFIG.name} — Export Incentive & eBRC Tracker`,
    short_name: APP_CONFIG.name,
    description:
      "Find unclaimed RoDTEP export incentives and generate DGFT-compliant bulk eBRC spreadsheets.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#0F2744",
    orientation: "portrait-primary",
    scope: "/",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["business", "finance", "productivity"],
    lang: "en-IN",
  };
}
