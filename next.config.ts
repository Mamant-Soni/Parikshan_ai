import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Medical documents can be a few MB (photos of prescriptions / PDFs).
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  // Uploaded files are stored OUTSIDE the public folder and streamed through an
  // ownership-checked route handler (/api/records/[id]/file), so medical
  // documents are never publicly addressable.
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
