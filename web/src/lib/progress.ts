// 施政進度（模擬）：假設市府採納了「預設指標下的建議增設前 30 名」，並隨機指定每個點目前的狀態。
// 用固定的亂數種子，每次打開網頁結果都一樣；使用者調整權重不會改變這份清單。
// 真實情況下，這份資料應該由環保局每週更新（見 README 的 100 天落地方案）。

import { cellCenter } from "./hexgrid";
import type { CellResult } from "./indicators";
import type { ProgressItem, ProgressStatus } from "../types";

const STATUSES: ProgressStatus[] = ["已設置", "施工中", "規劃中", "未處理"];
const STATUS_P = [0.3, 0.2, 0.27, 0.23];
const TODAY = Date.UTC(2026, 9, 19);

/** 小型固定種子亂數（mulberry32） */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeProgress(picks: CellResult[], districtOf: (at: [number, number]) => string, seed = 42): ProgressItem[] {
  const rand = rng(seed);
  return picks.map((p, i) => {
    const u = rand();
    let k = 0;
    for (let acc = STATUS_P[0]; u > acc && k < STATUSES.length - 1; acc += STATUS_P[++k]);
    const daysAgo = 3 + Math.floor(rand() * 72);
    const [lat, lng] = cellCenter(p.cell);
    const district = districtOf([lat, lng]);
    return {
      rank: i + 1,
      cell: p.cell,
      lat,
      lng,
      district,
      status: STATUSES[k],
      updated_at: new Date(TODAY - daysAgo * 86_400_000).toISOString().slice(0, 10),
      owner: `${district}清潔隊`,
      simulated: true,
    };
  });
}
