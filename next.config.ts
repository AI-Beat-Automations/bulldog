import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const ancestors = (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
    return [
      {
        source: "/widget",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${ancestors || "'none'"}`,
          },
          // NO X-Frame-Options: DENY aquí (rompería el embed).
        ],
      },
    ];
  },
};

export default nextConfig;
