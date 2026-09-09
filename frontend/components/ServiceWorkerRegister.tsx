"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on production only.
 * Extracted to its own client component so we can drop the
 * `dangerouslySetInnerHTML` script tag from the root layout.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onLoad = () => {
      // Add timestamp to force browser to check for new SW version on every deploy
      const swUrl = `/sw.js?v=${Date.now()}`;
      navigator.serviceWorker.register(swUrl).catch(() => {
        /* SW registration failure is non-fatal — silently ignore. */
      });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
