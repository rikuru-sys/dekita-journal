import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        id: "./",
        name: "できたこと記録",
        short_name: "できたこと",
        description: "毎日の、できたことを振り返る。",
        lang: "ja",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#f8f8f2",
        theme_color: "#f8f8f2",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{html,css,js,woff2,webp,png}"],
        navigateFallback: "index.html",
      },
    }),
  ],
});
