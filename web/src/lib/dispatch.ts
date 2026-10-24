// 動態調度：此刻哪些清潔分隊需要出動。
// 一個分隊轄內有 DISPATCH.MIN_BINS 個以上的桶 ≥ DISPATCH.LEVEL%（地圖上的橘紅色桶），才列出、才通知；
// 只有一兩桶滿的分隊不通知。
//
// Demo 調整（dampForDemo）：原始模擬在尖峰時段會同時有七八個分隊要出動，深夜又一個都沒有。
// 為了隨時打開都有東西可看、又不會滿畫面都是紅的，載入時把即時畫面（B 感測派車）的資料調整成
// 每個小時剛好 SQUADS 個分隊需要通知，每隊剛好 MIN_BINS 桶需清運（第 MIN_BINS 桶滿了才通知）：
//   原本就夠桶數的分隊，最多留 SQUADS 個（桶多、最滿的優先），其他分隊的桶全部壓到門檻以下，地圖上不會有橘紅色；
//   不夠的話，挑最接近門檻的分隊補上，把它最滿的 MIN_BINS 桶補到 BOOST_LEVELS。
// 只改瀏覽器裡的資料，不動 fill.json；一週清運比較用的是 fill.json 的統計，不受影響。

import type { BinProps, FeatureCollection, FillData } from "../types";
import { FULL_LEVEL, distanceM } from "./live";
import { pilotBinIndices } from "./pilot";
import { squadLabel, squadOf } from "./squads";

export const DISPATCH = {
  /** 需清運的門檻（%），和地圖的橘紅色、表格的「需清運」相同 */
  LEVEL: FULL_LEVEL,
  /** 分隊轄內至少幾桶需清運，才需要通知 */
  MIN_BINS: 3,
  /** 每個小時剛好幾個分隊需要通知 */
  SQUADS: 3,
  /** 被壓下來的桶，填滿度乘上這個比例（90%→68%、100%→75%） */
  DAMP: 0.75,
  /** 需要通知的分隊不夠時，被挑中的分隊最滿的幾桶補到這些值 */
  BOOST_LEVELS: [98, 95, 92],
} as const;

/** 每個桶的負責分隊全名（「大安和平分隊」）；不在試辦區的是 null */
export function binSquads(bins: FeatureCollection<BinProps>): (string | null)[] {
  return bins.features.map((f) => {
    const s = squadOf(f.properties.district, f.geometry.coordinates[1], f.geometry.coordinates[0]);
    return s ? squadLabel(s) : null;
  });
}

/** 把即時畫面（B）的資料調成 Demo 用的量；回傳新物件，不改原資料 */
export function dampForDemo(fill: FillData, bins: FeatureCollection<BinProps>): FillData {
  const pilot = pilotBinIndices(bins);
  const squads = binSquads(bins);
  const B = fill.levels.B.map((row) => row.slice());
  const hours = B[0]?.length ?? 0;

  // 試辦區的桶依分隊分組
  const bySquad = new Map<string, number[]>();
  for (const i of pilot) if (squads[i]) bySquad.set(squads[i]!, [...(bySquad.get(squads[i]!) ?? []), i]);

  for (let h = 0; h < hours; h++) {
    // 每個分隊的桶，最滿的排前面
    const groups = [...bySquad.entries()].map(([squad, idx]) => ({
      squad,
      idx: [...idx].sort((a, b) => B[b][h] - B[a][h] || a - b),
    }));
    const fullOf = (g: { idx: number[] }) => g.idx.filter((i) => B[i][h] >= DISPATCH.LEVEL);

    // 已經夠桶數的分隊：桶多的、最滿的優先，最多留 SQUADS 個
    const ready = groups
      .filter((g) => fullOf(g).length >= DISPATCH.MIN_BINS)
      .sort((a, b) => fullOf(b).length - fullOf(a).length || B[b.idx[0]][h] - B[a.idx[0]][h] || a.squad.localeCompare(b.squad));
    const keep = new Set(ready.slice(0, DISPATCH.SQUADS).map((g) => g.squad));

    // 不夠 SQUADS 個：依「第 MIN_BINS 滿的桶」由高到低挑分隊，補到門檻以上
    const k = DISPATCH.MIN_BINS - 1;
    const candidates = groups
      .filter((g) => !keep.has(g.squad) && g.idx.length >= DISPATCH.MIN_BINS)
      .sort((a, b) => B[b.idx[k]][h] - B[a.idx[k]][h] || a.squad.localeCompare(b.squad));
    for (const pick of candidates) {
      if (keep.size >= DISPATCH.SQUADS) break;
      pick.idx.slice(0, DISPATCH.MIN_BINS).forEach((i, j) => (B[i][h] = Math.max(B[i][h], DISPATCH.BOOST_LEVELS[j])));
      keep.add(pick.squad);
    }

    // 要派工的分隊只留最滿的 MIN_BINS 桶；其他分隊（不派工的區域）所有需清運的桶都壓到門檻以下
    for (const g of groups) {
      const extra = keep.has(g.squad) ? fullOf(g).slice(DISPATCH.MIN_BINS) : fullOf(g);
      for (const i of extra) B[i][h] = Math.round(B[i][h] * DISPATCH.DAMP);
    }
  }

  return { ...fill, levels: { ...fill.levels, B } };
}

export interface SquadDispatch {
  /** 「大安和平分隊」 */
  squad: string;
  /** 需清運的桶（填滿度高到低） */
  members: number[];
  /** 「和平東路二段一帶」 */
  area: string;
  lat: number;
  lng: number;
  /** 涵蓋所有成員的半徑（公尺），畫圈用 */
  radiusM: number;
}

/** 從地址取出路名：「士東路180號對面(…)」→「士東路」、「中山北路三段.南往北」→「中山北路三段」 */
export function roadName(address: string | undefined): string {
  if (!address) return "";
  const m = address.match(/^.*?(?:路|街|大道)(?:[一二三四五六七八九十]段|\d段)?/);
  return (m ? m[0] : address.replace(/[\d(（].*$/, "")).trim();
}

/** 此刻需要出動的分隊（轄內 ≥ MIN_BINS 桶需清運），桶多的排前面 */
export function squadDispatch(
  bins: FeatureCollection<BinProps>,
  squads: (string | null)[],
  pilot: number[],
  level: (i: number) => number
): SquadDispatch[] {
  const groups = new Map<string, number[]>();
  for (const i of pilot) {
    if (level(i) < DISPATCH.LEVEL || !squads[i]) continue;
    groups.set(squads[i]!, [...(groups.get(squads[i]!) ?? []), i]);
  }
  const out: SquadDispatch[] = [];
  for (const [squad, members] of groups) {
    if (members.length < DISPATCH.MIN_BINS) continue;
    members.sort((a, b) => level(b) - level(a) || a - b);
    const pts = members.map((i) => bins.features[i].geometry.coordinates);
    const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const radiusM = Math.max(...pts.map((p) => distanceM(lat, lng, p[1], p[0]))) + 60;
    const roads = [...new Set(members.map((i) => roadName(bins.features[i].properties.road)).filter(Boolean))].slice(0, 2);
    out.push({ squad, members, area: roads.length ? `${roads.join("、")}一帶` : "", lat, lng, radiusM });
  }
  return out.sort((a, b) => b.members.length - a.members.length || a.squad.localeCompare(b.squad, "zh-TW"));
}

/** 通知內文：「大安和平分隊轄內有 4 處、中山南京分隊轄內有 3 處垃圾桶需清運，建議指派清運作業」 */
export function dispatchMessage(list: SquadDispatch[]): string {
  if (!list.length) return "目前沒有分隊需要出動。";
  return `${list.map((d) => `${d.squad}轄內有 ${d.members.length} 處`).join("、")}垃圾桶需清運，建議指派清運作業`;
}
