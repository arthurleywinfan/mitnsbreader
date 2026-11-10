// Offline support. The app shell is cached on install; round PDFs are cached by the page
// (see setupOffline in app.js) in a separate cache so app updates don't re-download them.
const SHELL = "nsb-shell-v1";
const PDFS = "nsb-pdf-v1";
const SHELL_FILES = [
  "./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "data/questions.json", "vendor/pdf.min.mjs", "vendor/pdf.worker.min.mjs",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== PDFS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && req.url.includes("/pdf/")) (await caches.open(PDFS)).put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === "navigate") return caches.match("index.html");
      throw err;
    }
  })());
});
