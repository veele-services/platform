"use client";

type GoogleMapsLoaderOptions = {
  apiKey: string;
  mapId?: string | null;
  language?: string;
  region?: string;
  libraries?: string[];
};

declare global {
  interface Window {
    google?: { maps?: unknown } & Record<string, unknown>;
    __fieldgridGoogleMapsLoader?: Promise<unknown>;
  }
}

function buildGoogleMapsScriptUrl(options: GoogleMapsLoaderOptions): string {
  const url = new URL("https://maps.googleapis.com/maps/api/js");
  url.searchParams.set("key", options.apiKey);
  url.searchParams.set("v", "weekly");
  if (options.language) url.searchParams.set("language", options.language);
  if (options.region) url.searchParams.set("region", options.region);
  if (options.mapId) url.searchParams.set("map_ids", options.mapId);
  if (options.libraries?.length) {
    url.searchParams.set("libraries", options.libraries.join(","));
  }
  return url.toString();
}

export function loadGoogleMapsJavaScriptApi(
  options: GoogleMapsLoaderOptions,
): Promise<unknown> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps kan alleen in de browser laden."));
  }

  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__fieldgridGoogleMapsLoader) return window.__fieldgridGoogleMapsLoader;

  window.__fieldgridGoogleMapsLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = buildGoogleMapsScriptUrl(options);
    script.async = true;
    script.defer = true;
    script.dataset.fieldgridGoogleMaps = "true";
    script.addEventListener("load", () => resolve(window.google));
    script.addEventListener("error", () => {
      window.__fieldgridGoogleMapsLoader = undefined;
      reject(new Error("Google Maps kon niet worden geladen."));
    });
    document.head.appendChild(script);
  });

  return window.__fieldgridGoogleMapsLoader;
}
