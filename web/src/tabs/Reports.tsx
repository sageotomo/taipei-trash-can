import { useCallback, useMemo } from "react";
import type L from "leaflet";
import { HexLayer, PointLayer, PANES } from "../map/layers";
import { escapeHtml } from "../ui";
import type { AppData } from "../data";
import type { Report } from "../types";
import { MAP } from "../lib/theme";
import { CATEGORY_COLORS } from "./reportColors";

export { CATEGORY_COLORS };

const HOT_COLORS = ["#8a5a5e", "#b8565a", "#e0566a", "#ff8a8f"];
function hotClass(count: number): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  if (count === 2) return 1;
  if (count < 5) return 2;
  return 3;
}

/** 每格的垃圾桶數與「現行固定排程下一週平均滿溢小時數」 */
export function useBinStats(data: AppData) {
  return useMemo(() => {
    const stats = new Map<string, { bins: number; overflowSum: number }>();
    data.bins.features.forEach((f, i) => {
      const s = stats.get(f.properties.cell) ?? { bins: 0, overflowSum: 0 };
      s.bins += 1;
      s.overflowSum += data.fill.overflow.A[i];
      stats.set(f.properties.cell, s);
    });
    return stats;
  }, [data]);
}

// ---------------- 地圖 ----------------

interface LayersProps {
  data: AppData;
  reports: Report[];
  reportCounts: Map<string, number>;
  selected: string | null;
  selectedId: string | null;
  onPickReport?: (id: string) => void;
}

export function ReportLayers({ data, reports, reportCounts, selected, selectedId, onPickReport }: LayersProps) {
  // 點的顏色是通報類別
  const colorOf = useCallback((r: Report) => CATEGORY_COLORS[r.category] ?? "#e0566a", []);
  // 有通報的格子＋目前選的格子
  const cells = useMemo(() => {
    const set = new Set(reportCounts.keys());
    if (selected) set.add(selected);
    return [...set].sort();
  }, [reportCounts, selected]);

  const hexStyle = useCallback(
    (i: number): L.PathOptions => {
      const k = hotClass(reportCounts.get(cells[i]) ?? 0);
      const isSelected = cells[i] === selected;
      return {
        fillColor: k < 0 ? MAP.empty : HOT_COLORS[k],
        fillOpacity: k < 0 ? 0.04 : 0.4,
        color: isSelected ? MAP.selected : MAP.gridLine,
        weight: isSelected ? 3 : 0.5,
        opacity: isSelected ? 1 : 0.5,
      };
    },
    [cells, reportCounts, selected]
  );
  const tooltip = useCallback((i: number) => `通報 ${reportCounts.get(cells[i]) ?? 0} 件`, [cells, reportCounts]);

  const bins = useMemo(
    () => data.bins.features.map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] })),
    [data.bins]
  );
  const binStyle = useCallback(
    (): L.CircleMarkerOptions => ({ radius: 3.5, fillColor: "#3f9a6c", color: MAP.outline, weight: 1, fillOpacity: 1 }),
    []
  );

  const reportStyle = useCallback(
    (i: number): L.CircleMarkerOptions => {
      const r = reports[i];
      const fillColor = colorOf(r);
      if (r.id === selectedId) return { radius: 9, fillColor, color: MAP.selected, weight: 3, fillOpacity: 1 };
      return { radius: 5, fillColor, color: MAP.outline, weight: 1.2, fillOpacity: 1 };
    },
    [reports, colorOf, selectedId]
  );
  const reportTip = useCallback(
    (i: number) => {
      const r = reports[i];
      return `${escapeHtml(r.id)}・${r.category}${r.note ? `<br>${escapeHtml(r.note)}` : ""}`;
    },
    [reports]
  );
  const pickReport = useCallback((i: number) => onPickReport?.(reports[i].id), [onPickReport, reports]);

  return (
    <>
      <HexLayer cells={cells} style={hexStyle} tooltip={tooltip} />
      <PointLayer points={bins} style={binStyle} />
      <PointLayer
        points={reports}
        style={reportStyle}
        tooltip={reportTip}
        pane={PANES.top}
        onClick={onPickReport ? pickReport : undefined}
      />
    </>
  );
}
