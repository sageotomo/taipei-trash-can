// 點位圖示：放大地圖時，每種點位用不同的圖示標記，一眼就看得出是什麼。
// 縮小時點位太多，改用 canvas 圓點（同色），避免畫面和效能負擔。

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { PointLayer, PANES, type LatLngPoint } from "./layers";

export type PoiType = "bins" | "mrt" | "bus" | "youbike" | "drink" | "food";

// 24×24 的白色線條圖示（自己畫的通用圖形，不使用任何品牌標誌）
const GLYPHS: Record<PoiType, string> = {
  bins: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10.5 11v6M13.5 11v6"/>',
  mrt: '<rect x="6" y="3.5" width="12" height="13" rx="3"/><path d="M6 10.5h12M9 20.5l1.5-4M15 20.5l-1.5-4"/><circle cx="9.5" cy="13.5" r=".6"/><circle cx="14.5" cy="13.5" r=".6"/>',
  bus: '<rect x="5" y="3.5" width="14" height="14" rx="2"/><path d="M5 11h14M8 20.5v-3M16 20.5v-3"/><circle cx="8.5" cy="14.5" r=".6"/><circle cx="15.5" cy="14.5" r=".6"/>',
  youbike: '<circle cx="6.5" cy="15.5" r="3.5"/><circle cx="17.5" cy="15.5" r="3.5"/><path d="M6.5 15.5 10 9h6l1.5 6.5M10 9l3.5 6.5h-7M9 6.5h3"/>',
  drink: '<path d="M7 8.5h10l-1.3 12H8.3zM6 8.5h12M13 8.5l2.5-5.5"/>',
  food: '<path d="M4 12h16a8 7 0 0 1-16 0zM9 4l3.5 7M14.5 3.5l1.5 7.5"/>',
};

export const POI_TYPES: Record<PoiType, { label: string; color: string }> = {
  bins: { label: "現有清潔箱", color: "#2e6b4f" },
  mrt: { label: "捷運站", color: "#1d4e89" },
  bus: { label: "公車站", color: "#5f6f74" },
  youbike: { label: "YouBike 站", color: "#d38b12" },
  drink: { label: "飲料店", color: "#c0577a" },
  food: { label: "小吃店", color: "#8e5a2b" },
};

function svg(type: PoiType, size: number): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[type]}</svg>`;
}

/** 圖例或面板裡用的小圖示 */
export function PoiIcon({ type, size = 20 }: { type: PoiType; size?: number }) {
  return (
    <span
      className="poi-icon"
      style={{ background: POI_TYPES[type].color, width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg(type, Math.round(size * 0.68)) }}
    />
  );
}

const iconCache = new Map<PoiType, L.DivIcon>();
function divIcon(type: PoiType): L.DivIcon {
  let icon = iconCache.get(type);
  if (!icon) {
    icon = L.divIcon({
      className: "",
      html: `<span class="poi-marker" style="background:${POI_TYPES[type].color}">${svg(type, 15)}</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      tooltipAnchor: [0, -12],
    });
    iconCache.set(type, icon);
  }
  return icon;
}

const MAX_MARKERS = 700;

interface Props {
  type: PoiType;
  points: (LatLngPoint & { label?: string })[];
  /** 這個縮放等級以上才換成圖示 */
  iconZoom: number;
  pane?: string;
}

export function PoiPointLayer({ type, points, iconZoom, pane = PANES.points }: Props) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoomend", onZoom);
    return () => {
      map.off("zoomend", onZoom);
    };
  }, [map]);

  const color = POI_TYPES[type].color;
  const dotStyle = useMemo(() => {
    const radius = type === "mrt" ? 7 : type === "bins" ? 4.5 : 3.5;
    return () => ({ radius, fillColor: color, color: "#ffffff", weight: 1.2, fillOpacity: 1 });
  }, [type, color]);
  const tooltip = useMemo(() => (i: number) => points[i].label ?? POI_TYPES[type].label, [points, type]);

  if (zoom < iconZoom) return <PointLayer points={points} style={dotStyle} pane={pane} tooltip={tooltip} />;
  return <IconMarkers type={type} points={points} />;
}

/** 只把畫面範圍內的點畫成圖示標記，地圖移動時更新 */
function IconMarkers({ type, points }: { type: PoiType; points: (LatLngPoint & { label?: string })[] }) {
  const map = useMap();

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    const icon = divIcon(type);
    const refresh = () => {
      group.clearLayers();
      const bounds = map.getBounds().pad(0.2);
      let n = 0;
      for (const p of points) {
        if (n >= MAX_MARKERS) break;
        if (!bounds.contains([p.lat, p.lng])) continue;
        L.marker([p.lat, p.lng], { icon, keyboard: false, zIndexOffset: type === "mrt" ? 1000 : type === "bins" ? 500 : 0 })
          .bindTooltip(p.label ?? POI_TYPES[type].label, { direction: "top" })
          .addTo(group);
        n++;
      }
    };
    refresh();
    map.on("moveend", refresh);
    return () => {
      map.off("moveend", refresh);
      group.remove();
    };
  }, [map, type, points]);

  return null;
}
