// 市民通報只存在這台裝置的瀏覽器（localStorage），不需要後端。
// 照片與聯絡方式都是選填；照片先在瀏覽器壓縮（lib/photo.ts）再存，避免塞爆 localStorage。
// localStorage 在無痕模式或封鎖網站資料時可能讀寫失敗，所以都包在 try/catch 裡。

import { latLngToCell } from "./hexgrid";
import type { Report } from "../types";

const KEY = "trash-bins:reports:v2"; // 格子系統換過，舊版通報的格子編號不相容

export const CATEGORIES = ["亂丟垃圾", "垃圾桶滿溢", "家戶垃圾棄置"] as const;
export type Category = (typeof CATEGORIES)[number];

// 介面統一叫「垃圾桶」之前存下的通報類別，讀取時換成新名稱
const RENAMED: Record<string, Category> = { 清潔箱滿溢: "垃圾桶滿溢" };

export function loadLocalReports(): Report[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Report[]) : [];
    return Array.isArray(parsed) ? parsed.map((r) => (RENAMED[r.category] ? { ...r, category: RENAMED[r.category] } : r)) : [];
  } catch {
    return [];
  }
}

/** 回傳是否存成功（照片太多時可能超過瀏覽器容量） */
function save(reports: Report[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(reports));
    return true;
  } catch {
    // 存不了就只留在這次的畫面上
    return false;
  }
}

/** 這台裝置當地的日期 YYYY-MM-DD（toISOString 是 UTC，台灣早上 8 點前會變成前一天） */
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 這台裝置當地的日期時間 YYYY-MM-DDTHH:mm，給 <input type="datetime-local"> 用 */
export function localDateTime(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 發生時間最早可以填到幾天前 */
export const OCCURRED_MAX_DAYS = 30;

/**
 * 檢查市民填的發生時間（YYYY-MM-DDTHH:mm，當地時間）。沒問題回傳 null，有問題回傳要顯示的說明。
 * 承辦單位要靠時間判斷是不是固定時段的問題（例如晚上收攤後），所以必填。
 */
export function occurredError(value: string, now = new Date()): string | null {
  if (!value) return "請填問題發生的日期和時間。";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return "日期時間格式不對，請重新選一次。";
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  if (Number.isNaN(t)) return "日期時間格式不對，請重新選一次。";
  if (t > now.getTime() + 60_000) return "發生時間不能晚於現在。";
  if (t < now.getTime() - OCCURRED_MAX_DAYS * 86_400_000) return `只能通報 ${OCCURRED_MAX_DAYS} 天內發生的問題。`;
  return null;
}

/** 2026-10-21T13:40 → 10/21 13:40 */
export function shortDateTime(v: string): string {
  return v.slice(5).replace("-", "/").replace("T", " ");
}

/** 網頁上新增的通報編號：W＋月日＋三碼，例如 W1021-7K3（歷史通報是 R 開頭） */
export function newReportId(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const tail = Math.floor(Math.random() * 36 ** 3).toString(36).toUpperCase().padStart(3, "0");
  return `W${pad(d.getMonth() + 1)}${pad(d.getDate())}-${tail}`;
}

export interface ReportInput {
  category: Category;
  /** 問題發生的時間 YYYY-MM-DDTHH:mm */
  occurredAt: string;
  note: string;
  photo?: string;
  contact?: string;
}

export function createReport(input: ReportInput & { lat: number; lng: number }): Report {
  const contact = input.contact?.trim().slice(0, 100);
  return {
    id: newReportId(),
    category: input.category,
    note: input.note.trim().slice(0, 200),
    lat: input.lat,
    lng: input.lng,
    cell: latLngToCell(input.lat, input.lng),
    created_at: localDate(),
    occurred_at: input.occurredAt,
    local: true,
    ...(input.photo ? { photo: input.photo } : {}),
    ...(contact ? { contact } : {}),
  };
}

export function addLocalReport(existing: Report[], report: Report): { reports: Report[]; saved: boolean } {
  const next = [...existing, report];
  return { reports: next, saved: save(next) };
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
