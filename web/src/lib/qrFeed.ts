// 儀表板讀取掃 QR code 送出的通報（GET /api/reports），每 15 秒更新一次。
// 伺服器只給垃圾桶編號，座標用 bins.geojson 對回去；找不到的桶就略過。
// 本機 `npm run dev` 沒有後端，讀不到就當作沒有掃碼通報。

import { useEffect, useMemo, useState } from "react";
import { latLngToCell } from "./hexgrid";
import type { QrReportOut } from "./qrReport";
import type { BinProps, FeatureCollection, Report } from "../types";

export const POLL_MS = 15_000;

export function toReports(rows: QrReportOut[], bins: FeatureCollection<BinProps>): Report[] {
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
      created_at: r.created_at,
      occurred_at: r.occurred_at,
      qr: true,
      bin: r.bin,
      has_contact: r.has_contact,
    });
  }
  return out;
}

export function useQrReports(bins: FeatureCollection<BinProps> | undefined): Report[] {
  const [rows, setRows] = useState<QrReportOut[]>([]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await fetch("./api/reports", { cache: "no-store" });
        if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) {
          const body = (await r.json()) as { reports?: QrReportOut[] };
          if (!cancelled && Array.isArray(body.reports)) setRows(body.reports);
        }
      } catch {
        // 沒有後端或暫時連不上：保留上一次的資料
      }
      // 分頁在背景時不更新，回到前景再繼續
      if (!cancelled) timer = setTimeout(tick, document.hidden ? POLL_MS * 4 : POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return useMemo(() => (bins ? toReports(rows, bins) : []), [rows, bins]);
}
