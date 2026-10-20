// 自訂的正六角形網格（取代 H3），尖頂朝北，畫在地圖上是端正的。
// 和 pipeline/hexgrid.py 是同一套演算法，常數必須相同；parity.test.ts 會檢查兩邊算出的格子一致。
// 演算法參考 https://www.redblobgames.com/grids/hexagons/

export const SIZE_M = 150; // 中心到頂點的距離（公尺）
const LAT0 = 25.05;
const LNG0 = 121.55;
const M_PER_DEG_LAT = (6_371_000 * Math.PI) / 180; // 球面地球，和距離計算（haversine）一致
const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);
const SQRT3 = Math.sqrt(3);

export function cellId(q: number, r: number): string {
  return `${q}_${r}`;
}

function parse(cell: string): [number, number] {
  const [q, r] = cell.split("_").map(Number);
  return [q, r];
}

/** 經緯度 → 格子編號 */
export function latLngToCell(lat: number, lng: number): string {
  const x = (lng - LNG0) * M_PER_DEG_LNG;
  const y = (lat - LAT0) * M_PER_DEG_LAT;
  const qf = ((SQRT3 / 3) * x - y / 3) / SIZE_M;
  const rf = ((2 / 3) * y) / SIZE_M;
  const sf = -qf - rf;
  let q = Math.floor(qf + 0.5);
  let r = Math.floor(rf + 0.5);
  const s = Math.floor(sf + 0.5);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return cellId(q, r);
}

/** 格子中心 [緯度, 經度] */
export function cellCenter(cell: string): [number, number] {
  const [q, r] = parse(cell);
  const x = SIZE_M * SQRT3 * (q + r / 2);
  const y = SIZE_M * 1.5 * r;
  return [LAT0 + y / M_PER_DEG_LAT, LNG0 + x / M_PER_DEG_LNG];
}

/** 六個頂點 [緯度, 經度]，尖頂朝北 */
export function cellBoundary(cell: string): [number, number][] {
  const [lat, lng] = cellCenter(cell);
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 30) * Math.PI) / 180;
    return [lat + (SIZE_M * Math.sin(a)) / M_PER_DEG_LAT, lng + (SIZE_M * Math.cos(a)) / M_PER_DEG_LNG] as [number, number];
  });
}

/** 距離 k 圈以內的所有格子（含自己） */
export function gridDisk(cell: string, k: number): string[] {
  const [q, r] = parse(cell);
  const out: string[] = [];
  for (let dq = -k; dq <= k; dq++) {
    for (let dr = Math.max(-k, -dq - k); dr <= Math.min(k, -dq + k); dr++) out.push(cellId(q + dq, r + dr));
  }
  return out;
}
