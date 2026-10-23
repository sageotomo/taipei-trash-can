import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base 用相對路徑，部署到子路徑也能正常載入
// 三個頁面：index.html（儀表板）、qr.html（只有 QR code）、report.html（掃碼後的通報表單，沒有地圖）
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: "index.html", qr: "qr.html", report: "report.html" },
    },
  },
});
