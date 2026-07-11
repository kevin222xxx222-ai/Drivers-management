const CACHE_NAME = "driver-management-v4";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/manifest.json", "/favicon.svg", "/apple-touch-icon.svg", "/icon-192.svg", "/icon-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (shouldBypass(request)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(networkFirstStatic(request));
});

function shouldBypass(request) {
  if (request.method !== "GET") return true;
  if (request.headers.has("Next-Action")) return true;
  if (request.headers.has("RSC")) return true;
  if (request.headers.has("Next-Router-State-Tree")) return true;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/_next/")) return true;
  if (url.searchParams.has("_rsc")) return true;
  return false;
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_URL)) || new Response("Offline", { status: 503 });
  }
}

async function networkFirstStatic(request) {
  try {
    const response = await fetch(request);
    if (response.ok && isSafeStaticRequest(request)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

function isSafeStaticRequest(request) {
  const url = new URL(request.url);
  if (PRECACHE_URLS.includes(url.pathname)) return true;
  return ["image", "font"].includes(request.destination);
}
