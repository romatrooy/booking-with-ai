import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// В dev-режиме запросы к `/api` идут на сервис Fastify. В собранном
// виде web отдаётся тем же сервером — прокси не нужен.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        // IPv4 явно: иначе на Windows `localhost` резолвится в `::1`,
        // а сервер Fastify по умолчанию слушает только IPv4 — прокси
        // получает `ECONNREFUSED`.
        target: "http://127.0.0.1:8000",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
