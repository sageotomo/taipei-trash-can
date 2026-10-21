// 圖示定義（純資料，不依賴 Leaflet，計算模組和測試也能用）
import type { IconSpec } from "../types";

// 24×24 的白色線條圖示（自己畫的通用圖形，不使用任何品牌標誌）
export const GLYPHS: Record<string, { label: string; path: string }> = {
  bins: { label: "垃圾桶", path: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10.5 11v6M13.5 11v6"/>' },
  mrt: { label: "捷運", path: '<rect x="6" y="3.5" width="12" height="13" rx="3"/><path d="M6 10.5h12M9 20.5l1.5-4M15 20.5l-1.5-4"/><circle cx="9.5" cy="13.5" r=".6"/><circle cx="14.5" cy="13.5" r=".6"/>' },
  bus: { label: "公車", path: '<rect x="5" y="3.5" width="14" height="14" rx="2"/><path d="M5 11h14M8 20.5v-3M16 20.5v-3"/><circle cx="8.5" cy="14.5" r=".6"/><circle cx="15.5" cy="14.5" r=".6"/>' },
  youbike: { label: "自行車", path: '<circle cx="6.5" cy="15.5" r="3.5"/><circle cx="17.5" cy="15.5" r="3.5"/><path d="M6.5 15.5 10 9h6l1.5 6.5M10 9l3.5 6.5h-7M9 6.5h3"/>' },
  drink: { label: "飲料", path: '<path d="M7 8.5h10l-1.3 12H8.3zM6 8.5h12M13 8.5l2.5-5.5"/>' },
  food: { label: "餐飲", path: '<path d="M4 12h16a8 7 0 0 1-16 0zM9 4l3.5 7M14.5 3.5l1.5 7.5"/>' },
  home: { label: "住宅", path: '<path d="M4 11 12 4l8 7M6.5 9.5V20h11V9.5M10 20v-5.5h4V20"/>' },
  report: { label: "通報", path: '<path d="M12 4 3 20h18zM12 10v4.5"/><circle cx="12" cy="17.3" r=".6"/>' },
  toilet: { label: "廁所", path: '<circle cx="8" cy="5" r="1.6"/><circle cx="16" cy="5" r="1.6"/><path d="M8 8.5v12M5.5 9h5v6M16 8.5l-3 7h6zM15 15.5v5M17 15.5v5"/>' },
  store: { label: "商店", path: '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M5 9.5V20h14V9.5M10 20v-5h4v5"/>' },
  tree: { label: "公園", path: '<path d="M12 3 6 12h3l-3 5h12l-3-5h3zM12 17v4"/>' },
  school: { label: "學校", path: '<path d="M3 9l9-5 9 5-9 5zM7 11.5V16c0 1.5 2.5 3 5 3s5-1.5 5-3v-4.5"/>' },
  star: { label: "星號", path: '<path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/>' },
  pin: { label: "地標", path: '<path d="M12 21s-6-5.5-6-10.5a6 6 0 0 1 12 0C18 15.5 12 21 12 21z"/><circle cx="12" cy="10.5" r="2"/>' },
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

