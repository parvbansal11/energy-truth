import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "");
  const target = env.LOCAL_API_URL || "http://127.0.0.1:8000";
  return {
    plugins: [react(), tailwindcss()],
    define: { global: "globalThis" },
    envDir: "../..",
    server: {
      port: 5173,
      proxy: { "/api": { target, ws: true, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } },
    },
    build: {
      chunkSizeWarningLimit: 1800,
      rollupOptions: { output: { manualChunks: { maplibre: ["maplibre-gl"], deck: ["@deck.gl/core", "@deck.gl/layers", "@deck.gl/mapbox"] } } },
    },
  };
});
