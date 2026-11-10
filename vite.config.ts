import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

// base "./": đường dẫn tương đối, để bản build chạy được ở bất kỳ thư mục con nào (GitHub Pages: /<tên-repo>/).
// Mỗi trang HTML là một "điểm vào" riêng: trang game (index.html), Xưởng Mô Hình (models.html), Bản Vẽ Mặt Bằng (plan.html).
export default defineConfig({
  base: "./",
  // Three.js chiếm phần lớn dung lượng (~150 KB nén): chấp nhận được, chưa cần tách nhỏ.
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        models: fileURLToPath(new URL("./models.html", import.meta.url)),
        plan: fileURLToPath(new URL("./plan.html", import.meta.url))
      }
    }
  },
  plugins: [
    // PWA: cài game lên màn hình chính điện thoại và chơi được khi mất mạng.
    // Service worker lưu sẵn mọi file của bản build (game không có tệp âm thanh / mô hình, nên rất nhẹ).
    // "autoUpdate": có bản mới trên GitHub Pages thì lần mở sau tự dùng bản mới, không hỏi người chơi.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Iron Sky · Tư Lệnh Chiến Thuật",
        short_name: "Iron Sky",
        description: "Game chiến thuật thời gian thực 3D trên trình duyệt",
        lang: "vi",
        start_url: "./",
        scope: "./",
        display: "fullscreen",
        orientation: "landscape",
        background_color: "#0b0f16",
        theme_color: "#0b0f16",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Phông chữ Google: lưu lại sau lần tải đầu để chữ tiếng Việt vẫn đúng khi mất mạng.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
});
