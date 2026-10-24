// 圖示定義（純資料，不依賴 Leaflet，計算模組和測試也能用）
import type { IconSpec } from "../types";

// 彩色的 24×24 小插圖（類似 emoji 的扁平風格，自己畫的通用圖形，不使用任何品牌標誌）。
// 畫在圖層顏色的圓形底上；字串裡的 {accent} 會換成該圖層的顏色。

const WHITE = "#fff";
const DARK = "#2e3440";

export const GLYPHS: Record<string, { label: string; path: string }> = {
  bins: {
    label: "垃圾桶",
    path:
      `<rect x="10" y="2.6" width="4" height="2.4" rx="1" fill="#5b6b7a"/>` +
      `<rect x="4.8" y="4.4" width="14.4" height="3.4" rx="1.4" fill="#7d8e9e"/>` +
      `<path d="M6.4 8.4h11.2l-1.1 11.3a1.6 1.6 0 0 1-1.6 1.45H9.1a1.6 1.6 0 0 1-1.6-1.45z" fill="#b9c7d4"/>` +
      `<path d="M10 10.6v8M14 10.6v8" stroke="#8496a7" stroke-width="1.5" stroke-linecap="round"/>`,
  },
  mrt: {
    label: "捷運",
    path:
      `<path d="M8.6 20.8l1.6-3.2M15.4 20.8l-1.6-3.2" stroke="#55606e" stroke-width="1.8" stroke-linecap="round"/>` +
      `<rect x="5" y="2.8" width="14" height="15.4" rx="4" fill="${WHITE}"/>` +
      `<rect x="6.8" y="4.8" width="10.4" height="5.6" rx="1.6" fill="#24415f"/>` +
      `<rect x="5" y="11.6" width="14" height="1.8" fill="{accent}"/>` +
      `<circle cx="8.6" cy="15.6" r="1.2" fill="#ffcf3f"/><circle cx="15.4" cy="15.6" r="1.2" fill="#ffcf3f"/>`,
  },
  bus: {
    label: "公車",
    path:
      `<circle cx="8.2" cy="18.8" r="2" fill="${DARK}"/><circle cx="15.8" cy="18.8" r="2" fill="${DARK}"/>` +
      `<rect x="4.4" y="3.4" width="15.2" height="14.6" rx="3" fill="#ffc93c"/>` +
      `<rect x="6.2" y="5.4" width="11.6" height="5.4" rx="1.2" fill="#bfe6ff"/>` +
      `<rect x="4.4" y="12.2" width="15.2" height="1.6" fill="#f08a24"/>` +
      `<circle cx="7.6" cy="15.6" r="1.1" fill="${WHITE}"/><circle cx="16.4" cy="15.6" r="1.1" fill="${WHITE}"/>`,
  },
  youbike: {
    label: "自行車",
    path:
      `<circle cx="6.6" cy="15.4" r="3.6" fill="none" stroke="${DARK}" stroke-width="2"/>` +
      `<circle cx="17.4" cy="15.4" r="3.6" fill="none" stroke="${DARK}" stroke-width="2"/>` +
      `<path d="M6.6 15.4 10 9h6.4l1 6.4M10 9l3.2 6.4H6.6" fill="none" stroke="#e8432e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M15.8 9l.8-2.8h2" fill="none" stroke="${DARK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<rect x="7.6" y="5.6" width="4.6" height="2.1" rx="1" fill="${DARK}"/>`,
  },
  drink: {
    label: "飲料",
    path:
      `<path d="M13.4 7l2.4-4.4" stroke="#ff5d8f" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="M6.8 9.2h10.4l-1.2 10.6a1.6 1.6 0 0 1-1.6 1.4h-4.8a1.6 1.6 0 0 1-1.6-1.4z" fill="#f6e3c4"/>` +
      `<path d="M7.35 12.6h9.3l-.75 7.2a1.6 1.6 0 0 1-1.6 1.4h-4.6a1.6 1.6 0 0 1-1.6-1.4z" fill="#c98a4b"/>` +
      `<circle cx="10" cy="18.2" r="1" fill="#3b2418"/><circle cx="12.2" cy="19.2" r="1" fill="#3b2418"/><circle cx="14.2" cy="17.8" r="1" fill="#3b2418"/><circle cx="11.6" cy="16.6" r="1" fill="#3b2418"/>` +
      `<path d="M6 9.4a6 3.4 0 0 1 12 0z" fill="${WHITE}"/>`,
  },
  food: {
    label: "餐飲",
    path:
      `<path d="M13.6 2.8 10.8 10.6M17.6 3.4 13.4 10.8" stroke="#b5793d" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M5.8 11.2a6.2 4 0 0 1 12.4 0z" fill="#fff8e1"/>` +
      `<path d="M4 11.4h16a8 7.6 0 0 1-16 0z" fill="${WHITE}"/>` +
      `<path d="M6.2 14.6h11.6" stroke="#e8432e" stroke-width="1.6" stroke-linecap="round"/>`,
  },
  home: {
    label: "住宅",
    path:
      `<rect x="6.2" y="10" width="11.6" height="10.6" rx="1" fill="#fff4dc"/>` +
      `<path d="M11.1 3.6 3.6 10.2a1 1 0 0 0 .66 1.75h15.48a1 1 0 0 0 .66-1.75L12.9 3.6a1.3 1.3 0 0 0-1.8 0z" fill="#e8432e"/>` +
      `<rect x="10.4" y="15" width="3.2" height="5.6" rx=".6" fill="#a0612f"/>` +
      `<rect x="7.6" y="13" width="2.2" height="2.2" rx=".4" fill="#6cc4ff"/><rect x="14.2" y="13" width="2.2" height="2.2" rx=".4" fill="#6cc4ff"/>`,
  },
  report: {
    label: "通報",
    path:
      `<path d="M10.6 3.6 2.9 17.4a1.6 1.6 0 0 0 1.4 2.4h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 3.6a1.6 1.6 0 0 0-2.8 0z" fill="#ffcf3f"/>` +
      `<rect x="10.8" y="8" width="2.4" height="6.4" rx="1.2" fill="${DARK}"/>` +
      `<circle cx="12" cy="16.9" r="1.35" fill="${DARK}"/>`,
  },
  // ---- 通報類別 ----
  litter: {
    label: "亂丟垃圾",
    path:
      // 倒在地上的飲料杯，旁邊散著紙屑
      `<path d="M3.6 13.2 13.6 7.4l3 5.2-10 5.8a1.4 1.4 0 0 1-1.9-.5l-1.6-2.8a1.4 1.4 0 0 1 .5-1.9z" fill="${WHITE}"/>` +
      `<path d="M12.2 8.2l3 5.2" stroke="#7d8e9e" stroke-width="1.4"/>` +
      `<path d="M15.6 9.6l3.6-3.4" stroke="${DARK}" stroke-width="1.4" stroke-linecap="round"/>` +
      `<path d="M14.6 17.4l2.4-1 1.2 1.8-2.2 1.4z" fill="#ffe08a"/>` +
      `<circle cx="19.2" cy="13.6" r="1.3" fill="#ffe08a"/>` +
      `<path d="M8.2 19.6h3" stroke="${WHITE}" stroke-width="1.4" stroke-linecap="round"/>`,
  },
  overflow: {
    label: "垃圾桶滿溢",
    path:
      // 垃圾桶上面堆滿、滿出來
      `<path d="M6.4 11h11.2l-1 9.2a1.6 1.6 0 0 1-1.6 1.4H9a1.6 1.6 0 0 1-1.6-1.4z" fill="#b9c7d4"/>` +
      `<path d="M10 13v6.4M14 13v6.4" stroke="#8496a7" stroke-width="1.4" stroke-linecap="round"/>` +
      `<rect x="4.8" y="9" width="14.4" height="2.6" rx="1.2" fill="#7d8e9e"/>` +
      `<circle cx="9" cy="7.2" r="2.6" fill="${WHITE}"/><circle cx="14.4" cy="6.6" r="3" fill="#ffe08a"/>` +
      `<path d="M10.6 3.2l1.6 4.2" stroke="${WHITE}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<circle cx="18.6" cy="15" r="1.3" fill="${WHITE}"/>`,
  },
  trashbag: {
    label: "家戶垃圾棄置",
    path:
      // 綁起來的家用垃圾袋
      `<path d="M10.4 7.6c-4 1.4-6.2 5-5.8 9.2.3 2.6 2.6 4 7.4 4s7.1-1.4 7.4-4c.4-4.2-1.8-7.8-5.8-9.2z" fill="#3b4250"/>` +
      `<path d="M10.2 7.8 8.6 3.6l3.4 2.2 3.4-2.2-1.6 4.2z" fill="#3b4250"/>` +
      `<rect x="9.8" y="7" width="4.4" height="1.6" rx=".8" fill="#ffcf3f"/>` +
      `<path d="M8 13.4c.6-1.6 1.6-2.8 3-3.4" stroke="#8a93a3" stroke-width="1.2" stroke-linecap="round" fill="none"/>`,
  },
  toilet: {
    label: "廁所",
    path:
      `<rect x="3" y="3" width="18" height="18" rx="3" fill="${WHITE}"/>` +
      `<circle cx="8.4" cy="6.6" r="1.6" fill="#2f7fe0"/><rect x="6.6" y="9" width="3.6" height="5.6" rx="1.4" fill="#2f7fe0"/>` +
      `<path d="M7.6 14v4.6M9.2 14v4.6" stroke="#2f7fe0" stroke-width="1.5" stroke-linecap="round"/>` +
      `<circle cx="15.6" cy="6.6" r="1.6" fill="#ec4f7d"/><path d="M14.7 9.2 12.9 14.4a.8.8 0 0 0 .76 1.06h3.88a.8.8 0 0 0 .76-1.06L16.5 9.2a1 1 0 0 0-1.8 0z" fill="#ec4f7d"/>` +
      `<path d="M14.8 15.4v3.2M16.4 15.4v3.2" stroke="#ec4f7d" stroke-width="1.5" stroke-linecap="round"/>`,
  },
  store: {
    label: "商店",
    path:
      `<rect x="5" y="10" width="14" height="10.6" rx="1" fill="#fff4dc"/>` +
      `<rect x="7" y="13" width="4" height="7.6" rx=".6" fill="#6cc4ff"/><rect x="12.6" y="13" width="4.4" height="3.6" rx=".6" fill="#6cc4ff"/>` +
      `<path d="M5.4 3.8h13.2L20.4 9a2.1 2.1 0 0 1-4.2.4 2.1 2.1 0 0 1-4.2 0 2.1 2.1 0 0 1-4.2 0A2.1 2.1 0 0 1 3.6 9z" fill="#e8432e"/>` +
      `<path d="M9.8 3.8 9.4 9.4M14.2 3.8l.4 5.6" stroke="${WHITE}" stroke-width="1.6"/>`,
  },
  tree: {
    label: "公園",
    path:
      `<rect x="10.8" y="12.6" width="2.4" height="8.2" rx="1" fill="#9a5b2c"/>` +
      `<circle cx="12" cy="8.4" r="5.4" fill="#3fbf5a"/><circle cx="7.8" cy="11.6" r="3.6" fill="#3fbf5a"/><circle cx="16.2" cy="11.6" r="3.6" fill="#3fbf5a"/>` +
      `<circle cx="10" cy="6.6" r="1.4" fill="#7ee08f"/>`,
  },
  school: {
    label: "學校",
    path:
      `<path d="M7 11v4.2c0 1.8 2.3 3.3 5 3.3s5-1.5 5-3.3V11l-5 2.6z" fill="#3a3f4b"/>` +
      `<path d="M12 4 2.6 9 12 14 21.4 9z" fill="${DARK}" stroke="${DARK}" stroke-width="1" stroke-linejoin="round"/>` +
      `<path d="M19.8 9.6v4.8" stroke="#ffcf3f" stroke-width="1.5" stroke-linecap="round"/>` +
      `<circle cx="19.8" cy="15.4" r="1.3" fill="#ffcf3f"/>`,
  },
  star: {
    label: "星號",
    path: `<path d="m12 3.4 2.6 5.4 5.9.86-4.27 4.15 1 5.87L12 16.9l-5.23 2.78 1-5.87L3.5 9.66l5.9-.86z" fill="#ffcf3f" stroke="#ffcf3f" stroke-width="1.4" stroke-linejoin="round"/>`,
  },
  pin: {
    label: "地標",
    path:
      `<path d="M12 21.4s-6.6-5.8-6.6-11.2a6.6 6.6 0 0 1 13.2 0c0 5.4-6.6 11.2-6.6 11.2z" fill="#ef3b3b"/>` +
      `<circle cx="12" cy="10.2" r="2.6" fill="${WHITE}"/>`,
  },
};

/** 匯入圖層可以選的圖示與顏色 */
export const CUSTOM_GLYPHS = ["toilet", "store", "tree", "school", "star", "pin", "food", "drink"];
export const CUSTOM_COLORS = ["#3d7fc1", "#7b4fa0", "#2a9d8f", "#e76f51", "#6d597a", "#b5651d"];

export type PoiType = "bins" | "mrt" | "bus" | "youbike" | "drink" | "food" | "report" | "residential";

export const POI_TYPES: Record<PoiType, IconSpec & { label: string }> = {
  bins: { glyph: "bins", label: "現有垃圾桶", color: "#1fa463" },
  mrt: { glyph: "mrt", label: "捷運站", color: "#2f7fe0" },
  bus: { glyph: "bus", label: "公車站", color: "#14a3a3" },
  youbike: { glyph: "youbike", label: "YouBike 站", color: "#f5c400" },
  drink: { glyph: "drink", label: "飲料店", color: "#1eb4e6" },
  food: { glyph: "food", label: "餐飲店", color: "#e03ad0" },
  report: { glyph: "report", label: "市民通報", color: "#ef3b3b" },
  residential: { glyph: "home", label: "住宅區", color: "#8b6fd6" },
};

