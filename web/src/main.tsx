import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";

// 成功載入後清掉「已自動重新整理過」的標記，下次部署時才能再用
try {
  sessionStorage.removeItem("asset-reload");
} catch {
  // 無痕模式等情況可能無法使用 sessionStorage
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
