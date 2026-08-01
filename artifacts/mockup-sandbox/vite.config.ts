import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

const cartographerPlugins =
  process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
    ? [
        await import("@replit/vite-plugin-cartographer").then((module) =>
          module.cartographer({
            root: path.resolve(import.meta.dirname, ".."),
          }),
        ),
      ]
    : [];

export default defineConfig(({ command }) => {
  const rawPort = process.env.PORT;
  const port = rawPort ? Number(rawPort) : 4173;

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  if (command === "serve" && !rawPort) {
    throw new Error(
      "PORT environment variable is required when serving the sandbox.",
    );
  }

  const basePath = process.env.BASE_PATH ?? (command === "build" ? "/" : null);

  if (!basePath) {
    throw new Error(
      "BASE_PATH environment variable is required when serving the sandbox.",
    );
  }

  return {
    base: basePath,
    plugins: [
      mockupPreviewPlugin(),
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...cartographerPlugins,
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
      },
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist"),
      emptyOutDir: true,
    },
    server: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
