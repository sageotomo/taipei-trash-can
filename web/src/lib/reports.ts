// 市民通報只存在這台裝置的瀏覽器（localStorage），不需要後端，也不收個資。
// localStorage 在無痕模式或封鎖網站資料時可能讀寫失敗，所以都包在 try/catch 裡。

import { latLngToCell } from "h3-js";
import type { Report } from "../types";

const KEY = "trash-bins:reports";
export const H3_RES = 9;

export const CATEGORIES = ["亂丟垃圾", "清潔箱滿溢", "家戶垃圾棄置"] as const;
export type Category = (typeof CATEGORIES)[number];

export function loadLocalReports(): Report[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Report[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(reports: Report[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(reports));
  } catch {
    // 存不了就只留在這次的畫面上
  }
}

export function createReport(input: { category: Category; note: string; lat: number; lng: number }): Report {
  return {
    id: `L${Date.now().toString(36)}`,
    category: input.category,
    note: input.note.trim().slice(0, 200),
    lat: input.lat,
    lng: input.lng,
    h3: latLngToCell(input.lat, input.lng, H3_RES),
    created_at: new Date().toISOString().slice(0, 10),
    local: true,
  };
}

export function addLocalReport(existing: Report[], report: Report): Report[] {
  const next = [...existing, report];
  save(next);
  return next;
}

export function removeLocalReport(existing: Report[], id: string): Report[] {
  const next = existing.filter((r) => r.id !== id);
  save(next);
  return next;
}

export function clearLocalReports(): Report[] {
  save([]);
  return [];
}

// ---------- 處置建議（開發計畫「核心演算法」一節的表） ----------

export const HIGH_REPORTS = 3;      // 一格內 3 件以上算通報量高
export const OFTEN_FULL_HOURS = 10; // 現行固定排程下，一週滿溢 10 小時以上算常滿

export type Action = "add" | "collect" | "enforce" | "none";

export const ACTIONS: Record<Action, { label: string; why: string }> = {
  add: { label: "增設垃圾桶", why: "通報多，這一格卻沒有垃圾桶。" },
  collect: { label: "提高清運頻率或改用智慧桶", why: "通報多，這裡的桶也常滿：容量或清運跟不上。" },
  enforce: { label: "加強巡邏與取締", why: "通報多，但這裡的桶不常滿：問題在亂丟，不在容量。" },
  none: { label: "維持現狀", why: `通報不到 ${HIGH_REPORTS} 件。` },
};

export function suggestAction(reports: number, bins: number, avgOverflowHours: number): Action {
  if (reports < HIGH_REPORTS) return "none";
  if (bins === 0) return "add";
  return avgOverflowHours >= OFTEN_FULL_HOURS ? "collect" : "enforce";
}
