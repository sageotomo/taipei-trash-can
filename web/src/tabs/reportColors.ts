// 通報類別的顏色與地圖圖示（地圖、圖例、表單共用）

import type { IconSpec } from "../types";

export const CATEGORY_COLORS: Record<string, string> = {
  亂丟垃圾: "#e0566a",
  垃圾桶滿溢: "#e3b23c",
  家戶垃圾棄置: "#a07bd0",
};

const CATEGORY_GLYPHS: Record<string, string> = {
  亂丟垃圾: "litter",
  垃圾桶滿溢: "overflow",
  家戶垃圾棄置: "trashbag",
};

/** 通報類別 → 地圖圖示（圓底用類別顏色，中間是該類別的小插圖） */
export function categoryIcon(category: string): IconSpec {
  return { glyph: CATEGORY_GLYPHS[category] ?? "report", color: CATEGORY_COLORS[category] ?? "#e0566a" };
}
