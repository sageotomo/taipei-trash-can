import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base 用相對路徑，部署到 GitHub Pages 的子路徑（/trash-bins/）也能正常載入
export default defineConfig({
  base: "./",
  plugins: [react()],
});
