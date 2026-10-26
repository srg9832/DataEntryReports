/* CAP Data Entry Reports PWA: shell only, no CAP member data or auth/API caching. */
"use strict";
const CACHE = "cap-data-entry-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("cap-data-entry-shell-") && name !== CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Never intercept Supabase Auth, member/inspection data, RPCs, APIs, or third-party scripts.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  // Only cache explicit public static app assets; do not cache user information.
  const isNavigation = request.mode === "navigate";
  const asset = url.pathname.split("/").pop();
  const knownStatic = ["index.html", "styles.css", "app.js", "manifest.webmanifest",
    "icon-192.png", "icon-512.png"].includes(asset);
  if (!isNavigation && !knownStatic) return;

  event.respondWith((async () => {
    try {
      // Network-first updates the installed app, while the shell remains available if disconnected.
      const fresh = await fetch(request);
      if (fresh.ok && fresh.type === "basic") {
        const cache = await caches.open(CACHE);
        await cache.put(request, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(request,{ignoreSearch:true});
      if (cached) return cached;
      if (isNavigation) {
        const root = await caches.match(new URL("./", self.registration.scope).href);
        if (root) return root;
      }
      throw err;
    }
  })());
});
