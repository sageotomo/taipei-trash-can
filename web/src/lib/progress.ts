// 增桶進度（模擬）：每週一，市府用「截至上週日的通報」重新算一次預設指標下的建議增設前 30 名，
// 再追蹤每個點的設置狀態。前 30 名會隨通報變動，所以每週的清單不一樣。
//
// 模擬規則：
// - 第一週：每個點的狀態依 STATUS_P 的比例隨機指定（假設之前已經在做）。
// - 之後每週：每個追蹤中的點有 ADVANCE_P 的機率往前推一階（未處理 → 規劃中 → 施工中 → 已設置）。
// - 新進前 30 名的點從「未處理」開始。
// - 掉出前 30 名的點：還沒動工（未處理、規劃中）就移出清單；已經施工中或已設置的保留，標成不在前 30 名。
//
// 用固定的亂數種子，每次打開網頁結果都一樣；使用者調整權重不會改變這份清單。
// 真實情況下，這份資料應該由環保局每週更新（見 README 的 100 天落地方案）。

import { cellCenter } from "./hexgrid";
import type { CellResult } from "./indicators";
import type { ProgressItem, ProgressStatus } from "../types";

/** 依進度由慢到快排 */
const STAGES: ProgressStatus[] = ["未處理", "規劃中", "施工中", "已設置"];
/** 第一週各狀態的比例，順序同 STAGES */
const STATUS_P = [0.23, 0.27, 0.2, 0.3];
/** 之後每週往前推一階的機率 */
const ADVANCE_P = 0.4;
/** 施工中以後就不會因為掉出前 30 名而撤掉 */
const KEEP_FROM_STAGE = 2;

/** 模擬的週次（週一），由舊到新 */
export const WEEK_STARTS = ["2026-10-05", "2026-10-12", "2026-10-19"];

export interface ProgressWeek {
  /** 週一 YYYY-MM-DD */
  start: string;
  /** 週日 YYYY-MM-DD */
  end: string;
  /** 只用這天以前（不含）的通報算前 30 名 */
  cutoff: string;
}

export const WEEKS: ProgressWeek[] = WEEK_STARTS.map((start) => ({ start, end: addDays(start, 6), cutoff: start }));

export interface ProgressSnapshot {
  week: ProgressWeek;
  /** 本週清單：前 30 名照名次，後面接已動工但掉出前 30 名的點 */
  items: ProgressItem[];
  /** 本週新進前 30 名的點（第一週為空） */
  added: ProgressItem[];
  /** 本週移出清單的點（掉出前 30 名、還沒動工），狀態是移出前的 */
  removed: ProgressItem[];
  /** 本週狀態往前推的點（格子編號） */
  advanced: string[];
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

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

interface Tracked {
  stage: number;
  since: string;
  updated_at: string;
}

/**
 * @param rankings 每週的建議增設前 30 名，順序同 WEEKS（由舊到新）
 * @returns 每週的快照，順序同 WEEKS
 */
export function makeProgressHistory(
  rankings: CellResult[][],
  districtOf: (at: [number, number]) => string,
  seed = 42
): ProgressSnapshot[] {
  const rand = rng(seed);
  const tracked = new Map<string, Tracked>();

  const toItem = (cell: string, t: Tracked, rank: number | null): ProgressItem => {
    const [lat, lng] = cellCenter(cell);
    const district = districtOf([lat, lng]);
    return {
      rank,
      cell,
      lat,
      lng,
      district,
      status: STAGES[t.stage],
      since: t.since,
      updated_at: t.updated_at,
      owner: `${district}清潔隊`,
      simulated: true,
    };
  };

  return rankings.map((picks, w) => {
    const week = WEEKS[w];
    const top = new Set(picks.map((p) => p.cell));
    const advanced: string[] = [];

    // 1. 已追蹤的點往前推
    if (w > 0) {
      for (const [cell, t] of tracked) {
        if (t.stage < STAGES.length - 1 && rand() < ADVANCE_P) {
          t.stage += 1;
          t.updated_at = addDays(week.start, Math.floor(rand() * 5)); // 週一到週五之間
          advanced.push(cell);
        }
      }
    }

    // 2. 掉出前 30 名、還沒動工的移出
    const removed: ProgressItem[] = [];
    for (const [cell, t] of tracked) {
      if (!top.has(cell) && t.stage < KEEP_FROM_STAGE) {
        removed.push(toItem(cell, t, null));
        tracked.delete(cell);
      }
    }

    // 3. 新進前 30 名的開始追蹤
    const added: ProgressItem[] = [];
    picks.forEach((p, i) => {
      if (tracked.has(p.cell)) return;
      let t: Tracked;
      if (w === 0) {
        const u = rand();
        let k = 0;
        for (let acc = STATUS_P[0]; u > acc && k < STAGES.length - 1; acc += STATUS_P[++k]);
        t = { stage: k, since: week.start, updated_at: addDays(week.start, -(3 + Math.floor(rand() * 60))) };
      } else {
        t = { stage: 0, since: week.start, updated_at: week.start };
      }
      tracked.set(p.cell, t);
      if (w > 0) added.push(toItem(p.cell, t, i + 1));
    });

    const items = [
      ...picks.map((p, i) => toItem(p.cell, tracked.get(p.cell)!, i + 1)),
      ...[...tracked].filter(([cell]) => !top.has(cell)).map(([cell, t]) => toItem(cell, t, null)),
    ];
    return { week, items, added, removed, advanced };
  });
}

/** 2026-10-05 → 10/5 */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}
