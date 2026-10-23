// 動態調度的「區域滿桶警示」：同一個清潔隊轄區裡，彼此相距 RADIUS_M 內
// 有 MIN_BINS 個以上的垃圾桶填滿 ≥ LEVEL%，就算一個需要一起派車的區域。
//
// 清潔箱由轄區的區清潔隊負責收運，所以「行政區」就等於負責的清潔隊。
// 開放資料沒有官方箱號，B0001… 是依檔案順序自己編的。

import { distanceM } from "./live";

export const ALERT = { LEVEL: 90, RADIUS_M: 300, MIN_BINS: 3 } as const;

export interface AlertBin {
  lat: number;
  lng: number;
  district: string;
  road?: string;
}

export interface FullCluster {
  /** 穩定的識別：組成的桶索引排序後串起來 */
  key: string;
  district: string;
  /** 負責的清潔隊，例如「士林區清潔隊」 */
  team: string;
  /** 「士東路、中山北路六段一帶」 */
  area: string;
  /** 桶的索引（填滿度高到低） */
  members: number[];
  lat: number;
  lng: number;
  /** 涵蓋所有成員的半徑（公尺），畫圈用 */
  radiusM: number;
}

/** 每個桶在同一轄區、RADIUS_M 內的鄰居（含自己）。只跟位置有關，算一次就好。 */
export function neighborIndex(bins: AlertBin[], radiusM: number = ALERT.RADIUS_M): number[][] {
  return bins.map((a, i) =>
    bins.flatMap((b, j) =>
      j === i || (a.district === b.district && distanceM(a.lat, a.lng, b.lat, b.lng) <= radiusM) ? [j] : []
    )
  );
}

/** 從地址取出路名：「士東路180號對面(…)」→「士東路」、「中山北路三段.南往北」→「中山北路三段」 */
export function roadName(address: string | undefined): string {
  if (!address) return "";
  const m = address.match(/^.*?(?:路|街|大道)(?:[一二三四五六七八九十]段)?/);
  return (m ? m[0] : address.replace(/[\d(（].*$/, "")).trim();
}

/**
 * 找出此刻的滿桶區域。貪婪法：先從「附近滿桶最多」的桶開始圈，圈過的桶不再重複算，
 * 所以同一個桶只會出現在一則警示裡。
 */
export function findFullClusters(
  bins: AlertBin[],
  levels: number[],
  neighbors: number[][],
  opts: { level?: number; minBins?: number } = {}
): FullCluster[] {
  const level = opts.level ?? ALERT.LEVEL;
  const minBins = opts.minBins ?? ALERT.MIN_BINS;
  const full = new Set<number>();
  levels.forEach((v, i) => v >= level && full.add(i));

  const fullNeighbors = (i: number) => neighbors[i].filter((j) => full.has(j));
  const seeds = [...full].sort((a, b) => fullNeighbors(b).length - fullNeighbors(a).length || a - b);

  const used = new Set<number>();
  const out: FullCluster[] = [];
  for (const seed of seeds) {
    if (used.has(seed)) continue;
    const members = fullNeighbors(seed).filter((j) => !used.has(j));
    if (members.length < minBins) continue;
    members.forEach((j) => used.add(j));
    members.sort((a, b) => levels[b] - levels[a] || a - b);

    const lat = members.reduce((s, j) => s + bins[j].lat, 0) / members.length;
    const lng = members.reduce((s, j) => s + bins[j].lng, 0) / members.length;
    const radiusM = Math.max(...members.map((j) => distanceM(lat, lng, bins[j].lat, bins[j].lng))) + 60;
    const roads = [...new Set(members.map((j) => roadName(bins[j].road)).filter(Boolean))].slice(0, 2);
    const district = bins[seed].district;
    out.push({
      key: [...members].sort((a, b) => a - b).join("-"),
      district,
      team: `${district}清潔隊`,
      area: roads.length ? `${roads.join("、")}一帶` : `${district}`,
      members,
      lat,
      lng,
      radiusM,
    });
  }
  // 桶數多的排前面
  return out.sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
}

/** 從 fromHour 之後（不含）往後找，下一個會出現警示的小時；一週內都沒有就回傳 null */
export function nextAlertHour(
  bins: AlertBin[],
  levelsByBin: number[][],
  neighbors: number[][],
  fromHour: number
): number | null {
  const hours = levelsByBin[0]?.length ?? 0;
  for (let k = 1; k <= hours; k++) {
    const h = (fromHour + k) % hours;
    if (findFullClusters(bins, levelsByBin.map((row) => row[h]), neighbors).length > 0) return h;
  }
  return null;
}
