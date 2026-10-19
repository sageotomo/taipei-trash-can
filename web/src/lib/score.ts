// 缺口計算：需求 = Σ 權重 × 標準化特徵；缺口 = 需求 ÷ (1 + 本格桶數 + 0.5 × 相鄰桶數)
// 和 pipeline/common.py、pipeline/05_progress.py 用同一套規則。

import { gridDisk } from "h3-js";
import type { FeatureKey, GridCell, Weights } from "../types";

export const FEATURES: { key: FeatureKey; label: string; unit: string }[] = [
  { key: "mrt", label: "捷運人流", unit: "人次/日" },
  { key: "bus", label: "公車站", unit: "站" },
  { key: "youbike", label: "YouBike", unit: "站" },
  { key: "food", label: "飲料店、小吃店", unit: "家" },
  { key: "reports", label: "市民通報", unit: "件" },
  { key: "fill", label: "現有桶填滿速度", unit: "%/小時" },
];

export const DEFAULT_WEIGHTS: Weights = {
  mrt: 0.3,
  bus: 0.2,
  youbike: 0.1,
  food: 0.2,
  reports: 0.15,
  fill: 0.05,
};

export const TOP_N = 30;

/** 0 維持 0，正值換成在所有正值中的百分位數（平均名次），範圍 (0, 1]。 */
export function normalizePositive(values: number[]): number[] {
  const positive = values
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v > 0)
    .sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length).fill(0);
  const n = positive.length;
  let start = 0;
  while (start < n) {
    let end = start;
    while (end + 1 < n && positive[end + 1].v === positive[start].v) end++;
    const avgRank = (start + end) / 2 + 1; // 名次從 1 開始，同分取平均
    for (let k = start; k <= end; k++) out[positive[k].i] = avgRank / n;
    start = end + 1;
  }
  return out;
}

export interface CellScore {
  h3: string;
  index: number;            // 在 grid 陣列中的位置
  demand: number;
  supply: number;
  gap: number;
  rank: number;             // 1 = 最缺
  norm: Record<FeatureKey, number>;
  contributions: Record<FeatureKey, number>; // 各特徵佔需求的比例，合計 1
}

export function supplyOf(cell: Pick<GridCell, "bins" | "nbins">): number {
  return cell.bins + 0.5 * cell.nbins;
}

/** reportCounts：每格的通報數（歷史＋本機新增），與 grid 同順序 */
export function computeScores(grid: GridCell[], weights: Weights, reportCounts: number[]): CellScore[] {
  const reportsNorm = normalizePositive(reportCounts);
  const scores = grid.map((cell, index): CellScore => {
    const norm: Record<FeatureKey, number> = {
      mrt: cell.mrt_n,
      bus: cell.bus_n,
      youbike: cell.youbike_n,
      food: cell.food_n,
      reports: reportsNorm[index],
      fill: cell.fill_n,
    };
    let demand = 0;
    const parts = {} as Record<FeatureKey, number>;
    for (const { key } of FEATURES) {
      parts[key] = weights[key] * norm[key];
      demand += parts[key];
    }
    const contributions = {} as Record<FeatureKey, number>;
    for (const { key } of FEATURES) contributions[key] = demand > 0 ? parts[key] / demand : 0;
    const supply = supplyOf(cell);
    return { h3: cell.h3, index, demand, supply, gap: demand / (1 + supply), rank: 0, norm, contributions };
  });

  [...scores].sort((a, b) => b.gap - a.gap).forEach((s, i) => (s.rank = i + 1));
  return scores;
}

/**
 * 建議增設點：依缺口由高到低挑，需求要達總權重的 35%，
 * 而且和已挑的格子不能相鄰（避免同一條街連放好幾個）。
 * 權重全為 0 或缺口為 0 的格子沒有任何需求，不會被挑。
 */
export function pickRecommendations(scores: CellScore[], weights: Weights, n = TOP_N): CellScore[] {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const blocked = new Set<string>();
  const picks: CellScore[] = [];
  for (const s of [...scores].sort((a, b) => b.gap - a.gap)) {
    if (picks.length >= n) break;
    if (s.gap <= 0 || s.demand < 0.35 * total || blocked.has(s.h3)) continue;
    picks.push(s);
    for (const c of gridDisk(s.h3, 1)) blocked.add(c);
  }
  return picks;
}

/** 貢獻最大的特徵，用來在清單上寫一句「主因」 */
export function mainReason(s: CellScore): FeatureKey {
  return FEATURES.reduce((best, f) => (s.contributions[f.key] > s.contributions[best] ? f.key : best), "mrt" as FeatureKey);
}
