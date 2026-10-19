import { cellToBoundary, cellToLatLng } from "h3-js";

const boundaries = new Map<string, [number, number][]>();

/** 六角形的頂點，Leaflet 用的 [緯度, 經度] 順序（h3-js 預設就是這個順序） */
export function hexBoundary(h3: string): [number, number][] {
  let b = boundaries.get(h3);
  if (!b) {
    b = cellToBoundary(h3) as [number, number][];
    boundaries.set(h3, b);
  }
  return b;
}

export function hexCenter(h3: string): [number, number] {
  return cellToLatLng(h3) as [number, number];
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
