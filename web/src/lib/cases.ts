// 市民通報的「案件」視角：處理進度、承辦單位、最近的垃圾桶、是否逾期。
// 歷史通報的處理進度是模擬的（固定種子，依通報天數決定，越舊越可能已結案）；
// 政府單位在網頁上改的進度存在這台瀏覽器（localStorage）。

import type { Report } from "../types";

export const CASE_STATUSES = ["待處理", "已派工", "處理中", "已結案"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_COLORS: Record<CaseStatus, string> = {
  待處理: "#e0566a",
  已派工: "#e3b23c",
  處理中: "#4f93d6",
  已結案: "#8c9a9e",
};

/** 處理時限：通報後幾天內要結案（示意，參考 1999 陳情案件的處理時限） */
export const SLA_DAYS = 7;
/** 最近的垃圾桶超過這個距離就不算這件通報「對應」的桶 */
export const BIN_RADIUS_M = 150;

/** 模擬的基準日：歷史通報的處理進度以這天為準，所以每次打開都一樣 */
const SIM_DAY = "2026-10-21";

const DAY = 86_400_000;
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY);
}
function addDays(date: string, n: number): string {
  return new Date(Date.parse(date) + n * DAY).toISOString().slice(0, 10);
}

/** 字串雜湊成 0–1 的固定亂數（FNV-1a） */
export function hash01(s: string, salt = 0): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// 依通報天數的狀態機率：[待處理, 已派工, 處理中, 已結案]
function statusOdds(age: number): number[] {
  if (age <= 2) return [0.7, 0.3, 0, 0];
  if (age <= 7) return [0.2, 0.35, 0.3, 0.15];
  if (age <= 20) return [0.04, 0.06, 0.15, 0.75];
  return [0.02, 0, 0.03, 0.95];
}

export interface StatusRecord {
  status: CaseStatus;
  updated_at: string;
}

/** 歷史通報的模擬處理進度（新通報一律從「待處理」開始） */
export function simulatedStatus(r: Report): StatusRecord {
  if (r.local || r.qr) return { status: "待處理", updated_at: r.created_at };
  const age = Math.max(0, daysBetween(r.created_at, SIM_DAY));
  const odds = statusOdds(age);
  const u = hash01(r.id);
  let k = 0;
  for (let acc = odds[0]; u > acc && k < odds.length - 1; acc += odds[++k]);
  const status = CASE_STATUSES[k];
  if (status === "待處理") return { status, updated_at: r.created_at };
  // 最後更新：通報後 0～min(天數, 10) 天
  const after = Math.floor(hash01(r.id, 1) * (Math.min(age, 10) + 1));
  return { status, updated_at: addDays(r.created_at, after) };
}

export type StatusOverrides = Record<string, StatusRecord>;

/** 承辦單位：亂丟垃圾由稽查大隊取締，桶滿溢與家戶垃圾由各區清潔隊處理 */
export function ownerOf(category: string, district: string): string {
  if (category === "亂丟垃圾") return "環保稽查大隊";
  return district ? `${district}清潔隊` : "清潔隊";
}

/** 遮蔽聯絡方式：0912-***-678、a***@gmail.com */
export function maskContact(contact: string): string {
  const c = contact.trim();
  if (c.includes("@")) {
    const [name, domain] = c.split("@");
    return `${name.slice(0, 1)}***@${domain}`;
  }
  const digits = c.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 4)}-***-${digits.slice(-3)}`;
}

/** 空字串算合法（選填）；否則要是 email、手機（09 開頭 10 碼）或市話（0 開頭 9–10 碼） */
export function validContact(contact: string): boolean {
  const c = contact.trim();
  if (c === "") return true;
  if (c.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
  if (!/^[\d\s()+-]+$/.test(c)) return false;
  const digits = c.replace(/\D/g, "").replace(/^886/, "0");
  return /^09\d{8}$/.test(digits) || /^0[2-8]\d{7,8}$/.test(digits);
}

/** 歷史通報裡約三分之一有留聯絡方式（模擬，只會以遮蔽後的樣子出現） */
function simulatedContact(r: Report): string | undefined {
  if (hash01(r.id, 2) > 0.35) return undefined;
  const n = Math.floor(hash01(r.id, 3) * 1e8)
    .toString()
    .padStart(8, "0");
  return `09${n}`;
}

// ---------- 最近的垃圾桶 ----------

export interface BinPoint {
  id: string;
  lat: number;
  lng: number;
}

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const kx = 111_320 * Math.cos((aLat * Math.PI) / 180);
  const dx = (aLng - bLng) * kx;
  const dy = (aLat - bLat) * 110_574;
  return Math.hypot(dx, dy);
}

export function nearestBin(lat: number, lng: number, bins: BinPoint[]): { id: string; dist: number } | null {
  let best: { id: string; dist: number } | null = null;
  for (const b of bins) {
    const d = distanceM(lat, lng, b.lat, b.lng);
    if (!best || d < best.dist) best = { id: b.id, dist: d };
  }
  return best && best.dist <= BIN_RADIUS_M ? { id: best.id, dist: Math.round(best.dist) } : null;
}

// ---------- 組成案件 ----------

export interface ReportCase {
  report: Report;
  status: CaseStatus;
  updated_at: string;
  district: string;
  owner: string;
  bin: { id: string; dist: number } | null;
  contact?: string;
  /** 通報到今天幾天 */
  age: number;
  /** 超過處理時限還沒結案 */
  overdue: boolean;
}

export function buildCases(
  reports: Report[],
  overrides: StatusOverrides,
  bins: BinPoint[],
  districtOf: (at: [number, number]) => string,
  today: string
): ReportCase[] {
  return reports.map((r) => {
    const rec = overrides[r.id] ?? simulatedStatus(r);
    const district = r.district || districtOf([r.lat, r.lng]);
    const age = Math.max(0, daysBetween(r.created_at, today));
    return {
      report: r,
      status: rec.status,
      updated_at: rec.updated_at,
      district,
      owner: ownerOf(r.category, district),
      bin: nearestBin(r.lat, r.lng, bins),
      contact: r.local || r.qr ? r.contact || undefined : simulatedContact(r),
      age,
      overdue: rec.status !== "已結案" && age > SLA_DAYS,
    };
  });
}

// ---------- 存政府端改過的進度 ----------

const STATUS_KEY = "trash-bins:report-status:v1";

export function loadStatusOverrides(): StatusOverrides {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: StatusOverrides = {};
    for (const [id, v] of Object.entries(parsed as Record<string, StatusRecord>)) {
      if (CASE_STATUSES.includes(v?.status) && typeof v.updated_at === "string") out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveStatusOverrides(o: StatusOverrides): void {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(o));
  } catch {
    // 存不了就只在這次瀏覽有效
  }
}

// ---------- 匯出 CSV ----------

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 聯絡方式不匯出：匯出檔可能被轉寄，個資只留在系統裡 */
export function casesToCsv(cases: ReportCase[], placeOf: (c: ReportCase) => string): string {
  const head = ["通報編號", "通報日期", "發生時間", "類別", "行政區", "地點", "最近垃圾桶", "距離（公尺）", "處理進度", "最後更新", "承辦單位", "逾期", "有照片", "說明"];
  const rows = cases.map((c) => [
    c.report.id,
    c.report.created_at,
    c.report.occurred_at?.replace("T", " ") ?? "",
    c.report.category,
    c.district,
    placeOf(c),
    c.bin?.id ?? "",
    c.bin?.dist ?? "",
    c.status,
    c.updated_at,
    c.owner,
    c.overdue ? "是" : "",
    c.report.photo ? "是" : "",
    c.report.note ?? "",
  ]);
  return "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
