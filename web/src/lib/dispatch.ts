// 動態調度：此刻哪些清潔分隊轄內有垃圾桶需要清運（≥ DISPATCH.LEVEL%，就是地圖上的橘紅色桶）。
//
// Demo 調整（dampForDemo）：原始模擬在尖峰時段會同時有十幾個桶、七八個分隊要出動，深夜又一個都沒有。
// 為了隨時打開都有東西可看、又不會滿畫面都是紅的，載入時把即時畫面（B 感測派車）的資料調整成：
//   每個小時需清運的桶約剩原本的一半，而且只集中在 1～3 個分隊；
//   原本一個都沒有的時段，把最滿的那一桶補到 NIGHT_LEVEL%，保證至少 1 個分隊。
// 只改瀏覽器裡的資料，不動 fill.json；一週清運比較用的是 fill.json 的統計，不受影響。

import type { BinProps, FeatureCollection, FillData } from "../types";
import { FULL_LEVEL, distanceM } from "./live";
import { pilotBinIndices } from "./pilot";
import { squadLabel, squadOf } from "./squads";

export const DISPATCH = {
  /** 需清運的門檻（%），和地圖的橘紅色、表格的「需清運」相同 */
  LEVEL: FULL_LEVEL,
  /** 同一時間最多幾個分隊需要出動 */
  MAX_SQUADS: 3,
  /** 被壓下來的桶，填滿度乘上這個比例（90%→68%、100%→75%） */
  DAMP: 0.75,
  /** 原本沒有需清運桶的時段，最滿的那一桶補到這個值 */
  NIGHT_LEVEL: 95,
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

  for (let h = 0; h < hours; h++) {
    const full = pilot.filter((i) => B[i][h] >= DISPATCH.LEVEL);

    if (!full.length) {
      const top = pilot.reduce((a, b) => (B[b][h] > B[a][h] ? b : a), pilot[0]);
      if (top !== undefined) B[top][h] = Math.max(B[top][h], DISPATCH.NIGHT_LEVEL);
      continue;
    }

    // 依分隊分組，桶多的、最滿的分隊優先
    const groups = new Map<string, number[]>();
    for (const i of full) groups.set(squads[i]!, [...(groups.get(squads[i]!) ?? []), i]);
    for (const g of groups.values()) g.sort((a, b) => B[b][h] - B[a][h] || a - b);
    const ranked = [...groups.entries()].sort(
      (a, b) => b[1].length - a[1].length || B[b[1][0]][h] - B[a[1][0]][h] || a[0].localeCompare(b[0])
    );
    const n = Math.min(DISPATCH.MAX_SQUADS, Math.max(1, Math.ceil(ranked.length / 2)));
    const keepGroups = ranked.slice(0, n).map(([, g]) => g);

    // 保留的桶：每個分隊先留最滿的一桶，再依填滿度補到總數約一半
    const target = Math.max(n, Math.ceil(full.length / 2));
    const keep = new Set(keepGroups.map((g) => g[0]));
    const rest = keepGroups.flatMap((g) => g.slice(1)).sort((a, b) => B[b][h] - B[a][h] || a - b);
    for (const i of rest) {
      if (keep.size >= target) break;
      keep.add(i);
    }
    for (const i of full) if (!keep.has(i)) B[i][h] = Math.round(B[i][h] * DISPATCH.DAMP);
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

/** 此刻需要出動的分隊，桶多的排前面 */
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

/** 通知內文：「大安和平分隊轄內有 3 處、中山南京分隊轄內有 1 處垃圾桶需清運，建議指派清運作業」 */
export function dispatchMessage(list: SquadDispatch[]): string {
  if (!list.length) return "目前沒有分隊需要出動。";
  return `${list.map((d) => `${d.squad}轄內有 ${d.members.length} 處`).join("、")}垃圾桶需清運，建議指派清運作業`;
}
