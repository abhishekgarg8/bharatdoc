import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: ({ url, request }) =>
        request.mode === "navigate" &&
        ["/", "/dashboard", "/search", "/settings", "/settings/language", "/settings/prompt", "/recordings/new", "/onboarding", "/signup", "/h/pgimer", "/pending-approval"].includes(
          url.pathname
        ),
      handler: "NetworkFirst",
      options: {
        cacheName: "bharatdoc-app-shell",
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 24,
          maxAgeSeconds: 60 * 60 * 24
        }
      }
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "bharatdoc-static-assets",
        expiration: {
          maxEntries: 96,
          maxAgeSeconds: 60 * 60 * 24 * 7
        }
      }
    }
  ]
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bharatdoc/shared"]
};

export default withPWA(nextConfig);
