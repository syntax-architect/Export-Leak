import type { MetadataRoute } from "next";
import { GLOSSARY_TERMS } from "@/lib/seo/glossary";
import { APP_CONFIG } from "@/config/app";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = APP_CONFIG.url || "https://exportleak.in";
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tools/calculator`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tools/ebrc-validator`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tools/shipping-bill-extractor`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/learn`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/refund`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  // Programmatic glossary term pages
  const glossaryRoutes: MetadataRoute.Sitemap = GLOSSARY_TERMS.map((term) => ({
    url: `${baseUrl}/learn/${term.slug}`,
    lastModified: new Date(term.lastReviewed),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...glossaryRoutes];
}
