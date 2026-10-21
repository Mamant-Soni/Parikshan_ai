import type { MetadataRoute } from "next";

/**
 * PWA manifest.
 *
 * Installable so an elderly user can keep the app on their home screen. Icons
 * point at the SVG app mark; a production build should add 192/512 PNG masks.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Health Copilot",
    short_name: "Health Copilot",
    description:
      "Understand your health records in plain language. Upload prescriptions and lab reports, get simple explanations, and track your medicines.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7faf9",
    theme_color: "#15816f",
    orientation: "portrait-primary",
    lang: "en-IN",
    categories: ["health", "medical", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
