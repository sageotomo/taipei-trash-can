// 缺桶指數：每一格只看「格內」的資料，不看鄰格。
//
//   每個指標的分數 = min(格內數值 ÷ 上限, 1)，所以所有指標都在 0～1 之間
//                  開根號的指標（例如捷運人流）再取 √，讓中小站不會被最大站壓到接近 0
//   缺桶指數     = Σ(正向權重 × 分數) − Σ(負向權重 × 分數)，低於 0 算 0
//
// 圖層（DataLayer）是一堆點；指標（Indicator）說明怎麼從圖層算出每格一個數字、是加分還是扣分、權重多少。
// 同一個圖層可以產生好幾個指標，例如捷運站：「人流加總」是加分，「有幾個站」是扣分（站內有垃圾桶）。

import { gridDisk } from "./hexgrid";
import type { IconSpec } from "../types";

export interface LayerPoint {
  lat: number;
  lng: number;
  cell: string;
  name?: string;
  tag?: string;            // 同一圖層內的子類別，例如店家的 drink / food（只影響圖示）
  values?: Record<string, number>;
}

export interface LayerField {
  key: string;
  label: string;
  unit: string;
  source?: string;         // 這個欄位的資料來源和圖層不同時才寫，例如垃圾桶位置是真實、填滿速度是模擬
}

export interface DataLayer {
  id: string;
  label: string;
  unit: string;            // 計數的單位：站、家、個
  icon: IconSpec;
  fields: LayerField[];    // 可以加總的數值欄位
  points: LayerPoint[];
  source?: string;         // sources.json 的 key，用來標示真實／模擬
  custom?: boolean;        // 使用者匯入的
}

export type Method = "count" | "sum";

/**
 * 分數換算：
 *   linear = min(格內數值 ÷ 上限, 1)
 *   sqrt   = √(min(格內數值 ÷ 上限, 1))
 * 開根號適合差距很大的數值（捷運人流：台北車站約 30 萬、中位數約 2.5 萬），
 * 順序不變，但中小站不會被壓到接近 0。
 */
export type Curve = "linear" | "sqrt";

export function curveOf(ind: Pick<Indicator, "curve">): Curve {
  return ind.curve === "sqrt" ? "sqrt" : "linear";
}

/** 原始數值 → 0～1 分數 */
export function toScore(raw: number, cap: number, curve: Curve): number {
  const ratio = Math.min(Math.max(raw, 0) / cap, 1);
  return curve === "sqrt" ? Math.sqrt(ratio) : ratio;
}

export interface Indicator {
  id: string;
  label: string;
  layer: string;
  method: Method;
  field?: string;          // method = "sum" 時加總的欄位
  sign: 1 | -1;            // 1 = 需要桶（加分），-1 = 較不需要（扣分）
  weight: number;
  cap: number | null;      // 上限；null = 自動（直接相除：第 90 百分位；開根號：最大值）
  curve?: Curve;           // 分數換算；沒寫視為 "linear"
  enabled?: boolean;       // false = 暫時不算（保留權重，打開就恢復）；沒寫視為開啟
}

/** 關掉的指標權重視為 0，但不改動設定裡的權重 */
export function isOn(ind: Indicator): boolean {
  return ind.enabled !== false;
}

export function effectiveWeight(ind: Indicator): number {
  return isOn(ind) ? ind.weight : 0;
}

// 預設指標就是展示用的七個故事（捷運人流不放：搭捷運的人和逛商圈的人大多重疊，會和飲料店重複計算）（說明文字在 lib/stories.ts），順序就是故事順序
export const DEFAULT_INDICATORS: Indicator[] = [
  { id: "drinks", label: "飲料店（商圈）", layer: "drinks", method: "count", sign: 1, weight: 0.2, cap: null },
  { id: "youbike", label: "YouBike 站", layer: "youbike", method: "count", sign: 1, weight: 0.1, cap: null },
  { id: "residential", label: "住宅區", layer: "residential", method: "sum", field: "homes", sign: -1, weight: 0.2, cap: null },
  { id: "bus", label: "公車站", layer: "bus", method: "count", sign: 1, weight: 0.2, cap: null },
  { id: "bins", label: "現有垃圾桶", layer: "bins", method: "count", sign: -1, weight: 0.4, cap: null },
  { id: "reports", label: "市民反應缺桶數", layer: "reports", method: "count", sign: 1, weight: 0.15, cap: null },
  // 格內所有垃圾桶的填滿速度加總 ≈ 這格丟進桶子的垃圾量；和上面「現有垃圾桶」的扣分一起看，就是「垃圾量 − 桶子數」
  { id: "fill", label: "滿溢速度", layer: "bins", method: "sum", field: "fill", sign: 1, weight: 0.15, cap: null },
];

export const TOP_N = 30;
export const AUTO_CAP_PERCENTILE = 0.9;

// ---------------- 同一圖層、同一算法只能有一個指標 ----------------

/** "count" 或 "sum:欄位"，同一圖層內不能重複 */
export function methodKey(ind: Pick<Indicator, "method" | "field">): string {
  return ind.method === "count" ? "count" : `sum:${ind.field}`;
}

/** 這個圖層已經被其他指標用掉的算法（exceptId：正在編輯的那一個不算） */
export function usedMethods(indicators: Indicator[], layerId: string, exceptId?: string): Set<string> {
  return new Set(indicators.filter((i) => i.layer === layerId && i.id !== exceptId).map(methodKey));
}

/** 這個圖層還可以新增的算法 */
export function freeMethods(layer: DataLayer, indicators: Indicator[]): string[] {
  const used = usedMethods(indicators, layer.id);
  return ["count", ...layer.fields.map((f) => `sum:${f.key}`)].filter((m) => !used.has(m));
}

/** 移除重複的指標（保留第一個），用來修正舊版存下的設定 */
export function dedupeIndicators(list: Indicator[]): Indicator[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const key = `${i.layer}|${methodKey(i)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------- 把點分到格子 ----------------

export interface CellAgg {
  count: number;
  sums: Record<string, number>;
}
/** 圖層 id → 格子 → 格內的點數與欄位加總 */
export type Aggregated = Map<string, Map<string, CellAgg>>;

export function aggregate(layers: DataLayer[]): Aggregated {
  const out: Aggregated = new Map();
  for (const layer of layers) {
    const byCell = new Map<string, CellAgg>();
    for (const p of layer.points) {
      let a = byCell.get(p.cell);
      if (!a) {
        a = { count: 0, sums: {} };
        byCell.set(p.cell, a);
      }
      a.count += 1;
      if (p.values) for (const [k, v] of Object.entries(p.values)) if (Number.isFinite(v)) a.sums[k] = (a.sums[k] ?? 0) + v;
    }
    out.set(layer.id, byCell);
  }
  return out;
}

/** 所有「至少有一筆資料」的格子，就是地圖上要畫的格子 */
export function cellUniverse(agg: Aggregated): string[] {
  const set = new Set<string>();
  for (const byCell of agg.values()) for (const cell of byCell.keys()) set.add(cell);
  return [...set].sort();
}

export function rawValue(agg: Aggregated, ind: Indicator, cell: string): number {
  const a = agg.get(ind.layer)?.get(cell);
  if (!a) return 0;
  return ind.method === "count" ? a.count : (a.sums[ind.field ?? ""] ?? 0);
}

// ---------------- 上限 ----------------

/** 取整到好讀的數字：0.137 → 0.14、23.4 → 23、31,250 → 31,000 */
export function niceNumber(v: number): number {
  if (!(v > 0)) return 0;
  if (v < 1) return Number(v.toPrecision(2));
  if (v < 100) return Math.round(v);
  const p = 10 ** (Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
}

/**
 * 自動上限：
 *   直接相除 → 有資料（> 0）的格子裡，第 90 百分位的數值（前 10% 拿滿分）
 *   開根號   → 最大值，也就是「這格 ÷ 全台北最多的那格」
 */
export function autoCap(values: number[], method: Method, curve: Curve = "linear"): number {
  const positive = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (positive.length === 0) return 1;
  if (curve === "sqrt") return positive[positive.length - 1];
  const v = positive[Math.floor(AUTO_CAP_PERCENTILE * (positive.length - 1))];
  const cap = method === "count" ? Math.max(1, Math.round(v)) : niceNumber(v);
  return cap > 0 ? cap : 1;
}

// ---------------- 計算 ----------------

export interface IndicatorStat {
  cap: number;
  auto: boolean;
  cellsWithData: number;   // 數值 > 0 的格子數
  fullShare: number;       // 有資料的格子中，達到上限（拿滿分）的比例
}

export interface CellResult {
  cell: string;
  raw: number[];           // 每個指標的格內數值
  score: number[];         // 0～1
  term: number[];          // 帶正負號的 權重 × 分數
  value: number;           // 缺桶指數
  rank: number;            // 1 = 最缺；指數為 0 的格子是 0
}

export interface IndexResult {
  cells: CellResult[];               // 和 cellUniverse 同順序
  byCell: Map<string, CellResult>;
  stats: IndicatorStat[];            // 和 indicators 同順序
  maxPossible: number;               // 開啟中的正向權重合計（理論最大值）
  ranked: number;                    // 指數 > 0 的格子數
}

export function computeIndex(agg: Aggregated, cells: string[], indicators: Indicator[]): IndexResult {
  const raws = indicators.map((ind) => cells.map((c) => rawValue(agg, ind, c)));
  const stats: IndicatorStat[] = indicators.map((ind, k) => {
    const auto = ind.cap === null || !(ind.cap > 0);
    const cap = auto ? autoCap(raws[k], ind.method, curveOf(ind)) : (ind.cap as number);
    const positive = raws[k].filter((v) => v > 0);
    const full = positive.filter((v) => v >= cap).length;
    return { cap, auto, cellsWithData: positive.length, fullShare: positive.length ? full / positive.length : 0 };
  });

  const results: CellResult[] = cells.map((cell, i) => {
    const raw = indicators.map((_, k) => raws[k][i]);
    const score = raw.map((v, k) => toScore(v, stats[k].cap, curveOf(indicators[k])));
    const term = score.map((s, k) => indicators[k].sign * effectiveWeight(indicators[k]) * s);
    const sum = term.reduce((a, b) => a + b, 0);
    return { cell, raw, score, term, value: Math.max(0, sum), rank: 0 };
  });

  const ranked = results.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  ranked.forEach((r, i) => (r.rank = i + 1));

  return {
    cells: results,
    byCell: new Map(results.map((r) => [r.cell, r])),
    stats,
    maxPossible: indicators.reduce((s, ind) => s + (ind.sign > 0 ? effectiveWeight(ind) : 0), 0),
    ranked: ranked.length,
  };
}

/**
 * 建議增設點：缺桶指數由高到低挑，而且和已挑的格子不能相鄰（避免同一條街連放好幾個）。
 * 指數為 0 的格子不缺桶，不會被挑。
 */
export function pickRecommendations(result: IndexResult, n = TOP_N): CellResult[] {
  const blocked = new Set<string>();
  const picks: CellResult[] = [];
  for (const r of [...result.cells].sort((a, b) => b.value - a.value)) {
    if (picks.length >= n || r.value <= 0) break;
    if (blocked.has(r.cell)) continue;
    picks.push(r);
    for (const c of gridDisk(r.cell, 1)) blocked.add(c);
  }
  return picks;
}

/** 加分最多的指標，用來在清單上寫一句「主因」 */
export function mainReason(r: CellResult): number {
  let best = -1;
  r.term.forEach((t, k) => {
    if (t > 0 && (best < 0 || t > r.term[best])) best = k;
  });
  return best;
}

// ---------------- 分級 ----------------

/** 不缺（指數 0）的格子在圖例上的顏色；地圖上不缺的格子是全透明 */
export const NO_NEED_COLOR = "#c3d5dd";

/** ink：放在這個顏色底上的文字顏色；fillOpacity：地圖格子的填色不透明度 */
export const LEVELS = [
  { label: "還夠用", color: "#acbfc8", ink: "#14202a", fillOpacity: 0.45 },
  { label: "有點缺", color: "#a9975d", ink: "#14202a", fillOpacity: 0.35 },
  { label: "缺", color: "#b55736", ink: "#f4f1ec", fillOpacity: 0.3 },
  { label: "很缺", color: "#6e1d19", ink: "#f4f1ec", fillOpacity: 0.25 },
] as const;

/** 分級門檻：佔理論最大值（正向權重合計）的比例 */
export const LEVEL_BREAKS = [0.15, 0.3, 0.45];

/** -1 = 不缺（指數 0） */
export function levelOf(value: number, maxPossible: number): number {
  if (value <= 0 || maxPossible <= 0) return -1;
  const ratio = value / maxPossible;
  let k = 0;
  while (k < LEVEL_BREAKS.length && ratio >= LEVEL_BREAKS[k]) k++;
  return k;
}

// ---------------- 文字 ----------------

export function indicatorUnit(ind: Indicator, layer?: DataLayer): string {
  if (!layer) return "";
  if (ind.method === "count") return layer.unit;
  return layer.fields.find((f) => f.key === ind.field)?.unit ?? "";
}

/** 指標用到的資料來源（sources.json 的 key）：加總某欄位時，以欄位自己的來源為準 */
export function indicatorSource(ind: Indicator, layer?: DataLayer): string | undefined {
  if (!layer) return undefined;
  if (ind.method === "sum") return layer.fields.find((f) => f.key === ind.field)?.source ?? layer.source;
  return layer.source;
}

export function methodText(ind: Indicator, layer?: DataLayer): string {
  if (!layer) return "（圖層已刪除）";
  if (ind.method === "count") return `格內${layer.label}的數量`;
  const f = layer.fields.find((x) => x.key === ind.field);
  return `格內${layer.label}的「${f?.label ?? ind.field}」加總`;
}
