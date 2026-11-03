import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// base "./": đường dẫn tương đối, để bản build chạy được ở bất kỳ thư mục con nào (GitHub Pages: /<tên-repo>/).
// Mỗi trang HTML là một "điểm vào" riêng: trang game (index.html) và Xưởng Mô Hình (models.html).
export default defineConfig({
  base: "./",
  // Three.js chiếm phần lớn dung lượng (~150 KB nén): chấp nhận được, chưa cần tách nhỏ.
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        models: fileURLToPath(new URL("./models.html", import.meta.url))
      }
    }
  }
});
