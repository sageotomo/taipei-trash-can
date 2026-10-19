import { cellBoundary, cellCenter } from "./hexgrid";

const boundaries = new Map<string, [number, number][]>();

/** 六角形的頂點，Leaflet 用的 [緯度, 經度] 順序 */
export function hexBoundary(cell: string): [number, number][] {
  let b = boundaries.get(cell);
  if (!b) {
    b = cellBoundary(cell);
    boundaries.set(cell, b);
  }
  return b;
}

export function hexCenter(cell: string): [number, number] {
  return cellCenter(cell);
}

/** 把數值切成 k 個分位數級距，回傳分界值（長度 k-1） */
export function quantileBreaks(values: number[], k: number): number[] {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  return Array.from({ length: k - 1 }, (_, i) => sorted[Math.floor(((i + 1) / k) * (sorted.length - 1))]);
}

export function classOf(value: number, breaks: number[]): number {
  if (value <= 0) return -1;
  let c = 0;
  while (c < breaks.length && value > breaks[c]) c++;
  return c;
}
