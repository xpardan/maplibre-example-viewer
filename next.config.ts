import type { NextConfig } from "next";

const basePath = "/maplibre-example-viewer";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.NODE_ENV === "production" ? basePath : undefined,
  assetPrefix: process.env.NODE_ENV === "production" ? basePath : undefined,
};

export default nextConfig;
