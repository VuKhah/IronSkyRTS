import { defineConfig } from "vitest/config";

// Các bài test chạy cả trận AI đấu AI nên cần thêm thời gian (đặc biệt khi máy đang bận).
export default defineConfig({ test: { testTimeout: 60000 } });
