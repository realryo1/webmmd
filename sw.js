const CACHE_NAME = "webmmd-cache-v16";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./webmmd_files/ammo.js",
  "./webmmd_files/js-yaml.min.js",
  "./webmmd_files/clean_logic.js",
  "./webmmd_files/handler.js",
  "./webmmd_files/ui.js",
  "./webmmd_files/style.css",
  "./webmmd_files/jszip.min-oqqPI3B3.js",
  "./webmmd_files/zip-loader.js",
  "./webmmd_files/three.module.js",
  "./webmmd_files/NURBSCurve.js",
  "./webmmd_files/NURBSUtils.js",
  "./webmmd_files/FBXLoader.js",
  "./webmmd_files/fflate.module.js",
  "./webmmd_files/xr.js",
  "./webmmd_files/quest2_Controller.fbx",
  "./webmmd_files/OrbitControls.js",
  "./webmmd_files/MMDLoader.js",
  "./webmmd_files/MMDAnimationHelper.js",
  "./webmmd_files/CCDIKSolver.js",
  "./webmmd_files/MMDPhysics.js",
  "./webmmd_files/TGALoader.js",
  "./webmmd_files/mmdparser.module.js",
  "./webmmd_files/MMDToonShader.js"
];


self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put("./index.html", responseClone);
          });
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
