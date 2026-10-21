import type { MetadataRoute } from "next";

/** Only the public landing page is indexable; health data never is. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/upload",
          "/records",
          "/summary",
          "/assistant",
          "/trends",
          "/medications",
          "/interactions",
          "/timeline",
          "/family",
          "/settings",
          "/profile-setup",
          "/api/",
        ],
      },
    ],
    sitemap: undefined,
  };
}
