"use client";

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});

    // Hand the service worker this page and every app file it loaded, so the
    // app opens without internet next time. Only the main page needs it.
    if (window.location.pathname !== "/") return;
    navigator.serviceWorker.ready
      .then((reg) => {
        const files = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(window.location.origin + "/_next/static/"));
        reg.active?.postMessage({ type: "warm-cache", urls: ["/", ...files] });
      })
      .catch(() => {});
  }, []);
  return null;
}
