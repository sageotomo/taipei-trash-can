// 市民通報的「案件」視角：承辦單位、最近的垃圾桶。

import type { Report } from "../types";

/** 最近的垃圾桶超過這個距離就不算這件通報「對應」的桶 */
export const BIN_RADIUS_M = 150;

const DAY = 86_400_000;
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY);
}

/** 承辦單位：亂丟垃圾由稽查大隊取締，桶滿溢與家戶垃圾由各區清潔隊處理 */
export function ownerOf(category: string, district: string): string {
  if (category === "亂丟垃圾") return "環保稽查大隊";
  return district ? `${district}清潔隊` : "清潔隊";
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
  district: string;
  owner: string;
  bin: { id: string; dist: number } | null;
  /** 通報到今天幾天 */
  age: number;
}

export function buildCases(
  reports: Report[],
  bins: BinPoint[],
  districtOf: (at: [number, number]) => string,
  today: string
): ReportCase[] {
  return reports.map((r) => {
    const district = r.district || districtOf([r.lat, r.lng]);
    return {
      report: r,
      district,
      owner: ownerOf(r.category, district),
      bin: nearestBin(r.lat, r.lng, bins),
      age: Math.max(0, daysBetween(r.created_at, today)),
    };
  });
}

// ---------- 匯出 CSV ----------

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function casesToCsv(cases: ReportCase[], placeOf: (c: ReportCase) => string): string {
  const head = ["通報編號", "通報日期", "發生時間", "類別", "行政區", "地點", "最近垃圾桶", "距離（公尺）", "承辦單位", "有照片", "說明"];
  const rows = cases.map((c) => [
    c.report.id,
    c.report.created_at,
    c.report.occurred_at?.replace("T", " ") ?? "",
    c.report.category,
    c.district,
    placeOf(c),
    c.bin?.id ?? "",
    c.bin?.dist ?? "",
    c.owner,
    c.report.photo ? "是" : "",
    c.report.note ?? "",
  ]);
  return "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
