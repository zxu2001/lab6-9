import type { NextConfig } from "next";

// PROTOTYPE: GitHub Codespaces / VS Code port forwarding rewrites the Origin
// header to localhost:<port> while x-forwarded-host is the *.app.github.dev
// host, which Next's Server Actions CSRF check would otherwise reject.
const localPorts = ["3000", "3001", process.env.PORT].filter(Boolean);
const allowedOrigins = [
  ...localPorts.flatMap((p) => [`localhost:${p}`, `127.0.0.1:${p}`]),
  "*.app.github.dev",
];

const nextConfig: NextConfig = {
  // Native SQLite driver + Prisma adapter must stay external to the server bundle.
  serverExternalPackages: ["@prisma/adapter-better-sqlite3", "better-sqlite3"],
  experimental: {
    serverActions: { allowedOrigins },
  },
};

export default nextConfig;
