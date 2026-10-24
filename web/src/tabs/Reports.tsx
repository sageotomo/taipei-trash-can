import { useCallback, useMemo } from "react";
import { PANES } from "../map/layers";
import { ImagePointLayer, stickerSvg, type ImagePointStyle } from "../map/icons";
import { escapeHtml } from "../ui";
import type { AppData } from "../data";
import type { Report } from "../types";
import { MAP } from "../lib/theme";
import { CATEGORY_COLORS, categoryIcon } from "./reportColors";

export { CATEGORY_COLORS, categoryIcon };

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
// 只畫有通報的點，每件通報依類別畫成不同顏色的圖示；不畫六角格、不畫沒通報的垃圾桶。

interface LayersProps {
  reports: Report[];
  selectedId: string | null;
  onPickReport?: (id: string) => void;
}

const iconSrc = new Map<string, string>();
function categorySrc(category: string): string {
  let src = iconSrc.get(category);
  if (!src) {
    src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(stickerSvg(categoryIcon(category), 96, true));
    iconSrc.set(category, src);
  }
  return src;
}

export function ReportLayers({ reports, selectedId, onPickReport }: LayersProps) {
  const style = useCallback(
    (i: number): ImagePointStyle => {
      const r = reports[i];
      const src = categorySrc(r.category);
      return r.id === selectedId ? { src, scale: 1.4, ring: MAP.selected, front: true } : { src };
    },
    [reports, selectedId]
  );
  const tooltip = useCallback(
    (i: number) => {
      const r = reports[i];
      return `${escapeHtml(r.id)}・${r.category}${r.note ? `<br>${escapeHtml(r.note)}` : ""}`;
    },
    [reports]
  );
  const pick = useCallback((i: number) => onPickReport?.(reports[i].id), [onPickReport, reports]);

  return <ImagePointLayer points={reports} style={style} tooltip={tooltip} pane={PANES.top} onClick={onPickReport ? pick : undefined} />;
}
