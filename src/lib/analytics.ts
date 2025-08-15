// src/lib/analytics.ts
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";

export const gaPageview = (url: string) => {
  if (!GA_ID || typeof window === "undefined") return;
  // @ts-ignore
  window.gtag?.("config", GA_ID, { page_path: url });
};

export const gaEvent = (action: string, params: Record<string, any> = {}) => {
  if (!GA_ID || typeof window === "undefined") return;
  // @ts-ignore
  window.gtag?.("event", action, params);
};

export const fbqEvent = (name: string, params?: Record<string, any>) => {
  if (!META_PIXEL_ID || typeof window === "undefined") return;
  // @ts-ignore
  window.fbq?.("track", name, params);
};
