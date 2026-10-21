import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base 用相對路徑，部署到子路徑也能正常載入
// 兩個頁面：index.html（儀表板）、report.html（掃 QR code 後的通報表單，不載入地圖）
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: "index.html", report: "report.html" },
    },
  },
});
