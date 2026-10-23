// Demo 用的固定警示：載入網頁 1 秒後跳出，讓現場展示一定看得到。
// 對應的 3 個垃圾桶（大安區和平東路二段）在即時畫面一律顯示 LEVEL%（剛好達到區域警示的 90%），
// 地圖、桶表、區域警示清單才會和這則通知一致。只改瀏覽器裡的資料，不動 fill.json。

import type { BinProps, FeatureCollection, FillData } from "../types";

export const DEMO_ALERT = {
  delayMs: 1000,
  team: "大安和平分隊",
  district: "大安區",
  title: "即時提醒",
  message: "大安和平分隊轄內已有3處垃圾桶滿溢，建議指派清運作業",
  /** 這 3 桶在即時畫面的填滿度 */
  level: 90,
  /** 用地址找桶，桶號會隨資料重排，地址不會 */
  roads: ["和平東路2段108號", "和平東路2段110號", "和平東路2段134號"],
} as const;

/** 找出 Demo 用的桶（找不到的地址會略過） */
export function demoBinIndices(bins: FeatureCollection<BinProps>): number[] {
  const want = new Set<string>(DEMO_ALERT.roads);
  return bins.features.flatMap((f, i) =>
    f.properties.district === DEMO_ALERT.district && want.has(f.properties.road) ? [i] : []
  );
}

/** 把 Demo 的桶在即時畫面（B 感測派車）的每個小時都設成 DEMO_ALERT.level；回傳新物件，不改原資料 */
export function withDemoFill(fill: FillData, indices: number[]): FillData {
  if (!indices.length) return fill;
  const set = new Set(indices);
  return {
    ...fill,
    levels: { ...fill.levels, B: fill.levels.B.map((row, i) => (set.has(i) ? row.map(() => DEMO_ALERT.level) : row)) },
  };
}
