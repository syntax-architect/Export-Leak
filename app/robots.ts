import type { MetadataRoute } from "next";
import { APP_CONFIG } from "@/config/app";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = APP_CONFIG.url || "https://exportleak.in";

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/pricing",
          "/about",
          "/contact",
          "/terms",
          "/privacy",
          "/refund",
          "/tools/*",
          "/learn/*",
        ],
        disallow: [
          "/app/*",
          "/api/*",
          "/admin/*",
          "/invite/*",
          "/share/*",
          "/unsubscribe",
          "/design",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
