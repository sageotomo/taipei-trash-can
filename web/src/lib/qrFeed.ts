// 儀表板讀取掃 QR code 送出的通報（GET /api/reports），每 10 秒更新一次。
// 伺服器只存垃圾桶編號，座標用 bins.geojson 對回去；找不到的桶就略過。
// 本機 `npm run dev` 沒有後端，讀不到就當作沒有掃碼通報。

import { useEffect, useMemo, useState } from "react";
import { latLngToCell } from "./hexgrid";
import type { BinProps, FeatureCollection, Report } from "../types";

export const POLL_MS = 10_000;

/** 伺服器回傳的一筆（worker/index.ts 的 StoredReport） */
export interface QrRow {
  id: string;
  bin: string;
  category: string;
  occurred_at: string;
  note: string;
  contact: string;
  created_ms: number;
  has_photo: number;
}

/** 毫秒 → 台灣日期 YYYY-MM-DD */
export function taipeiDate(ms: number): string {
  return new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function toReports(rows: QrRow[], bins: FeatureCollection<BinProps>): Report[] {
  const at = new Map(bins.features.map((f) => [f.properties.id, f]));
  const out: Report[] = [];
  for (const r of rows) {
    const f = at.get(r.bin);
    if (!f) continue;
    const [lng, lat] = f.geometry.coordinates;
    out.push({
      id: r.id,
      category: r.category,
      note: r.note || undefined,
      lat,
      lng,
      cell: latLngToCell(lat, lng),
      district: f.properties.district,
      created_at: taipeiDate(r.created_ms),
      occurred_at: r.occurred_at,
      qr: true,
      bin: r.bin,
      ...(r.contact ? { contact: r.contact } : {}),
      ...(r.has_photo ? { photo: `./api/photo/${r.id}` } : {}),
    });
  }
  return out;
}

export function useQrReports(bins: FeatureCollection<BinProps> | undefined): Report[] {
  const [rows, setRows] = useState<QrRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await fetch("./api/reports", { cache: "no-store" });
        if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) {
          const body = (await r.json()) as { reports?: QrRow[] };
          // 內容沒變就不更新，避免地圖和指數每 10 秒重算
          if (!cancelled && Array.isArray(body.reports)) {
            setRows((prev) => (prev.length === body.reports!.length && prev.at(-1)?.id === body.reports!.at(-1)?.id ? prev : body.reports!));
          }
        }
      } catch {
        // 沒有後端或暫時連不上：保留上一次的資料
      }
      if (!cancelled) timer = setTimeout(tick, document.hidden ? POLL_MS * 6 : POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return useMemo(() => (bins ? toReports(rows, bins) : []), [rows, bins]);
}
