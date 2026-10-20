// 點位圖示：放大地圖時，每種點位用不同的圖示標記，一眼就看得出是什麼。
// 縮小時點位太多，改用 canvas 圓點（同色），避免畫面和效能負擔。

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { PointLayer, PANES, type LatLngPoint } from "./layers";
import type { IconSpec } from "../types";

import { GLYPHS } from "../lib/glyphs";
export { CUSTOM_COLORS, CUSTOM_GLYPHS, GLYPHS, POI_TYPES, type PoiType } from "../lib/glyphs";

function svg(glyph: string, size: number): string {
  const path = (GLYPHS[glyph] ?? GLYPHS.pin).path;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** 圖例或面板裡用的小圖示 */
export function PoiIcon({ icon, size = 20 }: { icon: IconSpec; size?: number }) {
  return (
    <span
      className="poi-icon"
      style={{ background: icon.color, width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg(icon.glyph, Math.round(size * 0.68)) }}
    />
  );
}

const iconCache = new Map<string, L.DivIcon>();
function divIcon(icon: IconSpec): L.DivIcon {
  const key = `${icon.glyph}|${icon.color}`;
  let out = iconCache.get(key);
  if (!out) {
    out = L.divIcon({
      className: "",
      html: `<span class="poi-marker" style="background:${icon.color}">${svg(icon.glyph, 15)}</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      tooltipAnchor: [0, -12],
    });
    iconCache.set(key, out);
  }
  return out;
}

const MAX_MARKERS = 700;

export type LabeledPoint = LatLngPoint & { label?: string };

interface Props {
  icon: IconSpec;
  label: string;
  points: LabeledPoint[];
  /** 這個縮放等級以上才換成圖示 */
  iconZoom: number;
  pane?: string;
  /** 縮小時的圓點半徑 */
  radius?: number;
  zIndexOffset?: number;
}

export function PoiPointLayer({ icon, label, points, iconZoom, pane = PANES.points, radius = 3.5, zIndexOffset = 0 }: Props) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoomend", onZoom);
    return () => {
      map.off("zoomend", onZoom);
    };
  }, [map]);

  const dotStyle = useMemo(
    () => () => ({ radius, fillColor: icon.color, color: "#ffffff", weight: 1.2, fillOpacity: 1 }),
    [radius, icon.color]
  );
  const tooltip = useMemo(() => (i: number) => points[i].label ?? label, [points, label]);

  if (zoom < iconZoom) return <PointLayer points={points} style={dotStyle} pane={pane} tooltip={tooltip} />;
  return <IconMarkers icon={icon} label={label} points={points} zIndexOffset={zIndexOffset} />;
}

/** 只把畫面範圍內的點畫成圖示標記，地圖移動時更新 */
function IconMarkers({ icon, label, points, zIndexOffset }: { icon: IconSpec; label: string; points: LabeledPoint[]; zIndexOffset: number }) {
  const map = useMap();

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    const marker = divIcon(icon);
    const renderer = L.canvas({ pane: PANES.points });
    const refresh = () => {
      group.clearLayers();
      const bounds = map.getBounds().pad(0.2);
      const visible = points.filter((p) => bounds.contains([p.lat, p.lng]));
      // 畫面內的點太多時，圖示會疊成一團又拖慢地圖，改畫圓點
      const asDots = visible.length > MAX_MARKERS;
      for (const p of visible) {
        const m = asDots
          ? L.circleMarker([p.lat, p.lng], { renderer, radius: 4, fillColor: icon.color, color: "#ffffff", weight: 1, fillOpacity: 1 })
          : L.marker([p.lat, p.lng], { icon: marker, keyboard: false, zIndexOffset });
        m.bindTooltip(p.label ?? label, { direction: "top" }).addTo(group);
      }
    };
    refresh();
    map.on("moveend", refresh);
    return () => {
      map.off("moveend", refresh);
      group.remove();
    };
  }, [map, icon, label, points, zIndexOffset]);

  return null;
}
