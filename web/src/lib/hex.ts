import { cellBoundary } from "./hexgrid";

const boundaries = new Map<string, [number, number][]>();

/** 六角形的頂點，Leaflet 用的 [緯度, 經度] 順序（有快取） */
export function hexBoundary(cell: string): [number, number][] {
  let b = boundaries.get(cell);
  if (!b) {
    b = cellBoundary(cell);
    boundaries.set(cell, b);
  }
  return b;
}
