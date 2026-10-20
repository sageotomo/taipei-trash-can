// 匯入使用者的 CSV：讀出座標、名稱和數值欄位，變成一個圖層。
// 全部在瀏覽器裡處理，檔案不會上傳到任何地方。

import { latLngToCell } from "./hexgrid";
import type { DataLayer, LayerField, LayerPoint } from "./indicators";
import type { IconSpec } from "../types";

export const MAX_ROWS = 50_000;
export const MAX_BYTES = 10 * 1024 * 1024;

// 台北市範圍（稍微放寬）
const BBOX = { minLat: 24.95, maxLat: 25.22, minLng: 121.44, maxLng: 121.67 };

/** RFC 4180 CSV：支援引號、引號內的逗號與換行、"" 跳脫、BOM、\r\n */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s_()（）-]/g, "");

function findColumn(headers: string[], exact: string[], contains: string[]): number {
  const n = headers.map(norm);
  let i = n.findIndex((h) => exact.includes(h));
  if (i < 0) i = n.findIndex((h) => contains.some((c) => h.includes(c)));
  return i;
}

export interface Columns {
  lat: number;
  lng: number;
  name: number;  // -1 = 沒有
}

export function detectColumns(headers: string[]): Columns {
  return {
    lat: findColumn(headers, ["lat", "latitude", "緯度", "y", "wgs84ay", "緯度wgs84"], ["緯度", "latitude"]),
    lng: findColumn(headers, ["lng", "lon", "long", "longitude", "經度", "x", "wgs84ax", "經度wgs84"], ["經度", "longitude"]),
    name: findColumn(headers, ["name", "名稱", "title", "站名", "店名", "地點", "名字"], ["名稱", "name"]),
  };
}

const toNumber = (v: string | undefined) => {
  if (v === undefined) return NaN;
  const t = v.trim().replace(/,/g, "");
  return t === "" ? NaN : Number(t);
};

/** 數值欄位：除了座標以外，八成以上非空白的值都是數字的欄位 */
export function numericColumns(headers: string[], rows: string[][], skip: number[]): number[] {
  return headers
    .map((_, j) => j)
    .filter((j) => {
      if (skip.includes(j)) return false;
      const vals = rows.map((r) => r[j]).filter((v) => v !== undefined && v.trim() !== "");
      if (vals.length === 0) return false;
      return vals.filter((v) => Number.isFinite(toNumber(v))).length / vals.length >= 0.8;
    });
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  columns: Columns;
}

export function readCsv(text: string): ParsedCsv {
  const all = parseCsv(text);
  if (all.length < 2) throw new Error("檔案裡沒有資料列。第一列要是欄位名稱，從第二列開始是資料。");
  const headers = all[0].map((h) => h.trim());
  const rows = all.slice(1);
  if (rows.length > MAX_ROWS) throw new Error(`資料超過 ${MAX_ROWS.toLocaleString()} 列，請先篩選再匯入。`);
  return { headers, rows, columns: detectColumns(headers) };
}

export interface BuildResult {
  points: LayerPoint[];
  fields: LayerField[];
  skipped: { invalid: number; outside: number };
  swapped: boolean;
}

/** 依選好的欄位，把資料列轉成點位。座標寫反（緯度 121、經度 25）會自動對調 */
export function buildPoints(parsed: ParsedCsv, cols: Columns): BuildResult {
  if (cols.lat < 0 || cols.lng < 0) throw new Error("請選擇緯度和經度欄位。");
  const { headers, rows } = parsed;

  const sample = rows.slice(0, 200).map((r) => [toNumber(r[cols.lat]), toNumber(r[cols.lng])]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (sample.length === 0) throw new Error("緯度、經度欄位裡沒有數字。");
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const mLat = median(sample.map((x) => x[0]));
  const mLng = median(sample.map((x) => x[1]));
  if (mLat > 1000 || mLng > 1000) {
    throw new Error("座標看起來是 TWD97（公尺）而不是經緯度。請先轉換成 WGS84 經緯度再匯入。");
  }
  const swapped = mLat > 90 && mLng < 90;

  const valueCols = numericColumns(headers, rows, [cols.lat, cols.lng, cols.name]);
  const fields: LayerField[] = valueCols.map((j) => ({ key: `f${j}`, label: headers[j] || `欄位 ${j + 1}`, unit: "" }));

  const points: LayerPoint[] = [];
  let invalid = 0;
  let outside = 0;
  for (const r of rows) {
    let lat = toNumber(r[cols.lat]);
    let lng = toNumber(r[cols.lng]);
    if (swapped) [lat, lng] = [lng, lat];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      invalid++;
      continue;
    }
    if (lat < BBOX.minLat || lat > BBOX.maxLat || lng < BBOX.minLng || lng > BBOX.maxLng) {
      outside++;
      continue;
    }
    lat = Math.round(lat * 1e5) / 1e5;
    lng = Math.round(lng * 1e5) / 1e5;
    const values: Record<string, number> = {};
    valueCols.forEach((j, k) => {
      const v = toNumber(r[j]);
      if (Number.isFinite(v)) values[fields[k].key] = v;
    });
    const name = cols.name >= 0 ? (r[cols.name] ?? "").trim().slice(0, 80) : "";
    points.push({ lat, lng, cell: latLngToCell(lat, lng), name: name || undefined, values: valueCols.length ? values : undefined });
  }
  if (points.length === 0) {
    throw new Error(outside > 0 ? `${outside} 筆資料都不在台北市範圍內。` : "沒有任何一列有正確的座標。");
  }
  return { points, fields, skipped: { invalid, outside }, swapped };
}

export function makeCustomLayer(input: { label: string; unit: string; icon: IconSpec; built: BuildResult }): DataLayer {
  return {
    id: `u${Date.now().toString(36)}`,
    label: input.label.trim().slice(0, 30) || "匯入資料",
    unit: input.unit.trim().slice(0, 4) || "個",
    icon: input.icon,
    fields: input.built.fields,
    points: input.built.points,
    custom: true,
  };
}

/** 範本檔，讓使用者知道格式 */
export const TEMPLATE_CSV = "名稱,緯度,經度,數值（選填）\n範例地點 A,25.0478,121.5170,120\n範例地點 B,25.0418,121.5438,80\n";
