// 動態調度：此刻哪些清潔分隊需要出動。
// 一個分隊轄內有 DISPATCH.MIN_BINS 個以上的桶 ≥ DISPATCH.LEVEL%（地圖上的橘紅色桶），才列出、才通知；
// 只有一兩桶滿的分隊不通知。
//
// Demo 調整（dampForDemo）：原始模擬在尖峰時段會同時有七八個分隊要出動，深夜又一個都沒有。
// 為了隨時打開都有東西可看、又不會滿畫面都是紅的，載入時把即時畫面（B 感測派車）的資料調整成
// 每個小時剛好 SQUADS 個分隊需要通知，每隊剛好 MIN_BINS 桶需清運，其他桶全部在門檻以下。
//
// 每隊那 MIN_BINS 桶要在地圖上看得清楚、不會被誤會成別隊的：
//   - 桶跟桶至少相距 MIN_GAP_M（同一個地點常有兩個桶疊在一起，地圖上看起來只有一個）；
//   - 這幾桶畫出的範圍圈（memberCircle）半徑不超過 MAX_RADIUS_M，圈裡不能有別的分隊的桶；
//   - 同一個小時要通知的分隊，範圍圈互不重疊。
// 每個分隊先找出所有符合條件的三桶組合；每個小時挑「原本就已經滿的桶最多、整體最滿」的組合，
// 依序挑出範圍圈不重疊的 SQUADS 個分隊，把這幾桶補到 BOOST_LEVELS 以上，其他需清運的桶壓到門檻以下。
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
  /** 同一分隊需清運的桶，彼此至少相距幾公尺（避免地圖上疊在一起） */
  MIN_GAP_M: 100,
  /** 範圍圈半徑 = 成員離中心最遠的距離 + 這個值（公尺） */
  CIRCLE_PAD_M: 60,
  /** 範圍圈半徑上限（公尺），太散的組合不拿來 Demo */
  MAX_RADIUS_M: 450,
} as const;

/** 一組桶在地圖上的範圍圈：中心是平均位置，半徑涵蓋所有成員再加 CIRCLE_PAD_M */
export function memberCircle(bins: FeatureCollection<BinProps>, members: number[]) {
  const pts = members.map((i) => bins.features[i].geometry.coordinates);
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const radiusM = Math.max(...pts.map((p) => distanceM(lat, lng, p[1], p[0]))) + DISPATCH.CIRCLE_PAD_M;
  return { lat, lng, radiusM };
}

interface Candidate {
  squad: string;
  members: number[];
  lat: number;
  lng: number;
  radiusM: number;
}

/** 每個分隊可以拿來 Demo 的 MIN_BINS 桶組合（桶不疊在一起、範圍圈裡沒有別隊的桶） */
export function demoCandidates(bins: FeatureCollection<BinProps>): Candidate[] {
  const pilot = pilotBinIndices(bins);
  const squads = binSquads(bins);
  const pos = (i: number) => bins.features[i].geometry.coordinates;
  const gap = (a: number, b: number) => distanceM(pos(a)[1], pos(a)[0], pos(b)[1], pos(b)[0]);

  const bySquad = new Map<string, number[]>();
  for (const i of pilot) if (squads[i]) bySquad.set(squads[i]!, [...(bySquad.get(squads[i]!) ?? []), i]);

  const out: Candidate[] = [];
  const pick = (squad: string, idx: number[], from: number, chosen: number[]) => {
    if (chosen.length === DISPATCH.MIN_BINS) {
      const c = memberCircle(bins, chosen);
      if (c.radiusM > DISPATCH.MAX_RADIUS_M) return;
      const intruder = pilot.some((j) => squads[j] !== squad && distanceM(c.lat, c.lng, pos(j)[1], pos(j)[0]) <= c.radiusM);
      if (!intruder) out.push({ squad, members: [...chosen], ...c });
      return;
    }
    for (let k = from; k < idx.length; k++) {
      if (chosen.some((c) => gap(c, idx[k]) < DISPATCH.MIN_GAP_M)) continue;
      pick(squad, idx, k + 1, [...chosen, idx[k]]);
    }
  };
  for (const [squad, idx] of bySquad) pick(squad, idx, 0, []);
  return out;
}

const overlaps = (a: Candidate, b: Candidate) => distanceM(a.lat, a.lng, b.lat, b.lng) < a.radiusM + b.radiusM;

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
  const candidates = demoCandidates(bins);
  const B = fill.levels.B.map((row) => row.slice());
  const hours = B[0]?.length ?? 0;

  for (let h = 0; h < hours; h++) {
    const full = (i: number) => (B[i][h] >= DISPATCH.LEVEL ? 1 : 0);
    const score = (c: Candidate) => ({
      full: c.members.reduce((s, i) => s + full(i), 0),
      sum: c.members.reduce((s, i) => s + B[i][h], 0),
    });
    // 原本就滿的桶多的優先，再比整體填滿度；同分用分隊名稱、桶號固定順序
    const ranked = candidates
      .map((c) => ({ c, ...score(c) }))
      .sort((a, b) => b.full - a.full || b.sum - a.sum || a.c.squad.localeCompare(b.c.squad) || a.c.members[0] - b.c.members[0]);

    const chosen: Candidate[] = [];
    for (const { c } of ranked) {
      if (chosen.length >= DISPATCH.SQUADS) break;
      if (chosen.some((o) => o.squad === c.squad || overlaps(o, c))) continue;
      chosen.push(c);
    }

    const keep = new Set<number>();
    for (const c of chosen) {
      const members = [...c.members].sort((a, b) => B[b][h] - B[a][h] || a - b);
      members.forEach((i, j) => {
        B[i][h] = Math.max(B[i][h], DISPATCH.BOOST_LEVELS[j]);
        keep.add(i);
      });
    }
    // 其他需清運的桶全部壓到門檻以下
    for (const i of pilot) {
      if (keep.has(i)) continue;
      while (B[i][h] >= DISPATCH.LEVEL) B[i][h] = Math.round(B[i][h] * DISPATCH.DAMP);
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
    const { lat, lng, radiusM } = memberCircle(bins, members);
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
