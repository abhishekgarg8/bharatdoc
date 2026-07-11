const SHELL_CACHE = "bharatdoc-shell-v2";
const STATIC_CACHE = "bharatdoc-static-v2";
const CURRENT_CACHES = new Set([SHELL_CACHE, STATIC_CACHE]);
const LEGACY_CACHES = new Set([
  "apis",
  "cross-origin",
  "google-fonts-stylesheets",
  "google-fonts-webfonts",
  "next-data",
  "next-image",
  "next-static-js-assets",
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "start-url",
  "static-audio-assets",
  "static-data-assets",
  "static-font-assets",
  "static-image-assets",
  "static-js-assets",
  "static-style-assets",
  "static-video-assets"
]);
const SHELLS = new Set([
  "/",
  "/access-rejected",
  "/dashboard",
  "/h/pgimer",
  "/onboarding",
  "/pending-approval",
  "/recordings/new",
  "/search",
  "/settings",
  "/settings/language",
  "/settings/prompt",
  "/signup"
]);

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                !CURRENT_CACHES.has(name) &&
                (name.startsWith("bharatdoc-") || name.startsWith("workbox-") || LEGACY_CACHES.has(name))
            )
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  )
);

function cacheable(response) {
  const policy = response.headers.get("cache-control") || "";
  return response.ok && !/(?:private|no-store)/i.test(policy) && !response.headers.get("set-cookie");
}

async function store(cache, key, response, limit) {
  await cache.put(key, response.clone());
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, -limit).map((oldest) => cache.delete(oldest)));
}

async function networkFirst(request, key) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (cacheable(response)) await store(cache, key, response, 24);
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) await store(cache, request, response, 96);
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    request.headers.has("authorization")
  ) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    if (SHELLS.has(url.pathname) && !url.search) {
      event.respondWith(networkFirst(request, `${url.origin}${url.pathname}`));
    } else {
      event.respondWith(fetch(request));
    }
    return;
  }

  if (
    !url.search &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/images/") ||
      url.pathname === "/favicon.svg" ||
      url.pathname === "/icon.svg")
  ) {
    event.respondWith(cacheFirst(request));
  }
});
