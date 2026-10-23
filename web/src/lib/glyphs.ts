// 圖示定義（純資料，不依賴 Leaflet，計算模組和測試也能用）
import type { IconSpec } from "../types";

// 可愛貼紙風格的 24×24 圖示（自己畫的通用圖形，不使用任何品牌標誌）。
// 主體用白色填滿、圓角，部分圖示帶小臉（眼睛、微笑、腮紅）。
// 字串裡的 {accent} 會在畫圖時換成該圖層的顏色。

const W = "#fff";
const INK = "#3b2b26";
const BLUSH = "#ff9eae";

/** 小臉：兩顆眼睛、微笑、腮紅。cx/cy 是兩眼中點，gap 是兩眼距離的一半 */
function face(cx: number, cy: number, gap = 2, blush = true): string {
  const eyes =
    `<circle cx="${cx - gap}" cy="${cy}" r="1.15" fill="${INK}"/>` +
    `<circle cx="${cx + gap}" cy="${cy}" r="1.15" fill="${INK}"/>`;
  const mouth = `<path d="M${cx - 0.9} ${cy + 1.5}q0.9 0.9 1.8 0" fill="none" stroke="${INK}" stroke-width="0.9" stroke-linecap="round"/>`;
  const cheeks = blush
    ? `<ellipse cx="${cx - gap - 1.3}" cy="${cy + 1.5}" rx="0.95" ry="0.6" fill="${BLUSH}" opacity="0.9"/>` +
      `<ellipse cx="${cx + gap + 1.3}" cy="${cy + 1.5}" rx="0.95" ry="0.6" fill="${BLUSH}" opacity="0.9"/>`
    : "";
  return eyes + mouth + cheeks;
}

const line = (d: string, w = 1.8, color = W) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

export const GLYPHS: Record<string, { label: string; path: string }> = {
  bins: {
    label: "垃圾桶",
    path:
      `<rect x="10" y="3.2" width="4" height="2.6" rx="1.2" fill="${W}"/>` +
      `<rect x="5.5" y="5" width="13" height="3.2" rx="1.6" fill="${W}"/>` +
      `<path d="M7 9.2h10l-.95 10.3a1.6 1.6 0 0 1-1.6 1.45h-4.9a1.6 1.6 0 0 1-1.6-1.45z" fill="${W}"/>` +
      face(12, 13.6, 2),
  },
  mrt: {
    label: "捷運",
    path:
      line("M9 21l1.4-3.5M15 21l-1.4-3.5", 2) +
      `<rect x="5.5" y="3.2" width="13" height="14.6" rx="4.2" fill="${W}"/>` +
      `<rect x="7.6" y="5.3" width="8.8" height="4.4" rx="1.6" fill="{accent}"/>` +
      face(12, 12.6, 2.1),
  },
  bus: {
    label: "公車",
    path:
      `<circle cx="8.3" cy="18.6" r="1.9" fill="${W}"/><circle cx="15.7" cy="18.6" r="1.9" fill="${W}"/>` +
      `<rect x="4.8" y="3.8" width="14.4" height="13.6" rx="3.6" fill="${W}"/>` +
      `<rect x="6.8" y="5.8" width="10.4" height="4.2" rx="1.3" fill="{accent}"/>` +
      face(12, 12.7, 2.3),
  },
  youbike: {
    label: "自行車",
    path:
      `<circle cx="6.8" cy="15.6" r="3.3" fill="none" stroke="${W}" stroke-width="2.2"/>` +
      `<circle cx="17.2" cy="15.6" r="3.3" fill="none" stroke="${W}" stroke-width="2.2"/>` +
      line("M6.8 15.6 10 9.3h6.2l1 6.3M10 9.3l3.2 6.3H6.8M15.6 9.3l.7-2.6h1.8", 2) +
      `<rect x="7.8" y="5.6" width="4.4" height="2.2" rx="1.1" fill="${W}"/>` +
      `<circle cx="13.2" cy="15.6" r="1.1" fill="${W}"/>`,
  },
  drink: {
    label: "飲料",
    path:
      line("M13.6 6.4l2.2-3.6", 1.9) +
      `<path d="M6.3 8.3a5.7 3.3 0 0 1 11.4 0z" fill="${W}"/>` +
      `<path d="M7 9h10l-1.15 10.3a1.6 1.6 0 0 1-1.6 1.45h-4.5a1.6 1.6 0 0 1-1.6-1.45z" fill="${W}"/>` +
      `<circle cx="10.1" cy="18.4" r=".85" fill="{accent}"/><circle cx="12" cy="19" r=".85" fill="{accent}"/><circle cx="13.9" cy="18.4" r=".85" fill="{accent}"/>` +
      face(12, 12.6, 1.8),
  },
  food: {
    label: "餐飲",
    path:
      line("M13.8 3.2 11 10.4M17.6 3.6 13.6 10.6", 1.6) +
      `<path d="M6.2 11.2a5.8 3.6 0 0 1 11.6 0z" fill="${W}"/>` +
      `<path d="M4.3 11.4h15.4a7.7 7.4 0 0 1-15.4 0z" fill="${W}"/>` +
      line("M4.6 11.4h14.8", 0.9, "{accent}") +
      face(12, 14.4, 2.2),
  },
  home: {
    label: "住宅",
    path:
      `<path d="M11.2 3.9 4.4 9.9a1 1 0 0 0 .66 1.75H6.4V19a1.6 1.6 0 0 0 1.6 1.6h8A1.6 1.6 0 0 0 17.6 19v-7.35h1.34a1 1 0 0 0 .66-1.75L12.8 3.9a1.2 1.2 0 0 0-1.6 0z" fill="${W}"/>` +
      `<rect x="10.7" y="16.8" width="2.6" height="3.8" rx="1.2" fill="{accent}"/>` +
      face(12, 12.6, 2.1),
  },
  report: {
    label: "通報",
    path:
      `<path d="M5.2 4.6h13.6a2.2 2.2 0 0 1 2.2 2.2v8.2a2.2 2.2 0 0 1-2.2 2.2h-6.6l-3.9 3.4a.5.5 0 0 1-.83-.38V17.2H5.2A2.2 2.2 0 0 1 3 15V6.8a2.2 2.2 0 0 1 2.2-2.2z" fill="${W}"/>` +
      `<rect x="10.9" y="6.8" width="2.2" height="5.6" rx="1.1" fill="{accent}"/>` +
      `<circle cx="12" cy="14.6" r="1.2" fill="{accent}"/>`,
  },
  toilet: {
    label: "廁所",
    path:
      `<circle cx="8" cy="5.2" r="2" fill="${W}"/><circle cx="16" cy="5.2" r="2" fill="${W}"/>` +
      `<rect x="5.8" y="8.3" width="4.4" height="7.4" rx="2" fill="${W}"/>` +
      `<path d="M14.8 8.9 12.6 15a1 1 0 0 0 .95 1.35h4.9a1 1 0 0 0 .95-1.35L17.2 8.9a1.3 1.3 0 0 0-2.4 0z" fill="${W}"/>` +
      line("M7 15v5.2M9 15v5.2M15 16v4.2M17 16v4.2", 1.8),
  },
  store: {
    label: "商店",
    path:
      `<rect x="5.5" y="10.4" width="13" height="10" rx="1.6" fill="${W}"/>` +
      `<path d="M6.3 4.2h11.4L19.6 9a2.4 2.4 0 0 1-4.6 1 2.4 2.4 0 0 1-3 1.2 2.4 2.4 0 0 1-3-1.2A2.4 2.4 0 0 1 4.4 9z" fill="${W}"/>` +
      line("M9.4 4.6 9 9.6M14.6 4.6 15 9.6", 0.9, "{accent}") +
      face(12, 14.6, 2.1),
  },
  tree: {
    label: "公園",
    path:
      `<rect x="10.9" y="13.5" width="2.2" height="7.2" rx="1.1" fill="${W}"/>` +
      `<circle cx="12" cy="8.6" r="5.2" fill="${W}"/><circle cx="7.9" cy="11.6" r="3.5" fill="${W}"/><circle cx="16.1" cy="11.6" r="3.5" fill="${W}"/>` +
      face(12, 10, 1.9),
  },
  school: {
    label: "學校",
    path:
      `<path d="M7 11v4.2c0 1.8 2.3 3.3 5 3.3s5-1.5 5-3.3V11l-5 2.6z" fill="${W}"/>` +
      `<path d="M12 4.2 2.8 9 12 13.8 21.2 9z" fill="${W}" stroke="${W}" stroke-width="1.2" stroke-linejoin="round"/>` +
      line("M19.8 9.6v4.6", 1.5) +
      `<circle cx="19.8" cy="15.2" r="1.2" fill="${W}"/>`,
  },
  star: {
    label: "星號",
    path:
      `<path d="m12 3.6 2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.9l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z" fill="${W}" stroke="${W}" stroke-width="1.6" stroke-linejoin="round"/>` +
      face(12, 12.1, 1.7, false),
  },
  pin: {
    label: "地標",
    path:
      `<path d="M12 21.2s-6.4-5.6-6.4-10.8a6.4 6.4 0 0 1 12.8 0c0 5.2-6.4 10.8-6.4 10.8z" fill="${W}"/>` +
      `<circle cx="12" cy="10.4" r="2.4" fill="{accent}"/>`,
  },
};

/** 匯入圖層可以選的圖示與顏色 */
export const CUSTOM_GLYPHS = ["toilet", "store", "tree", "school", "star", "pin", "food", "drink"];
export const CUSTOM_COLORS = ["#3d7fc1", "#7b4fa0", "#2a9d8f", "#e76f51", "#6d597a", "#b5651d"];

export type PoiType = "bins" | "mrt" | "bus" | "youbike" | "drink" | "food" | "report" | "residential";

export const POI_TYPES: Record<PoiType, IconSpec & { label: string }> = {
  bins: { glyph: "bins", label: "現有垃圾桶", color: "#3f9a6c" },
  mrt: { glyph: "mrt", label: "捷運站", color: "#3d7fc1" },
  bus: { glyph: "bus", label: "公車站", color: "#6f8a91" },
  youbike: { glyph: "youbike", label: "YouBike 站", color: "#d38b12" },
  drink: { glyph: "drink", label: "飲料店", color: "#c0577a" },
  food: { glyph: "food", label: "餐飲店", color: "#b07840" },
  report: { glyph: "report", label: "市民通報", color: "#e0566a" },
  residential: { glyph: "home", label: "住宅區", color: "#9a8a72" },
};
