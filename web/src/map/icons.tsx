// 點位圖示：每種點位用不同的彩色小插圖，一眼就看得出是什麼。
// 不論縮放多少，每個點都直接畫成圖示（不聚集成數字），
// 全部畫在 canvas 上，上萬個點也不會卡。

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { PANES, type LatLngPoint } from "./layers";
import type { IconSpec } from "../types";

import { GLYPHS } from "../lib/glyphs";
export { CUSTOM_COLORS, CUSTOM_GLYPHS, GLYPHS, POI_TYPES, type PoiType } from "../lib/glyphs";

/** 完整圖示 SVG：圖層顏色的圓底、白色外框、淡淡陰影，中間是彩色小插圖 */
export function stickerSvg(icon: IconSpec, px: number, withNs = false): string {
  const glyph = (GLYPHS[icon.glyph] ?? GLYPHS.pin).path.replaceAll("{accent}", icon.color);
  return (
    `<svg ${withNs ? 'xmlns="http://www.w3.org/2000/svg" ' : ""}viewBox="0 0 24 24" width="${px}" height="${px}" aria-hidden="true">` +
    `<circle cx="12" cy="12.7" r="11.1" fill="rgba(0,0,0,0.25)"/>` +
    `<circle cx="12" cy="12" r="11.1" fill="#fff"/>` +
    `<circle cx="12" cy="12" r="9.6" fill="${icon.color}"/>` +
    `<g transform="translate(12 12) scale(0.7) translate(-12 -12)">${glyph}</g>` +
    `</svg>`
  );
}

/** 圖例或面板裡用的小圖示 */
export function PoiIcon({ icon, size = 20 }: { icon: IconSpec; size?: number }) {
  return (
    <span
      className="poi-icon"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: stickerSvg(icon, size) }}
    />
  );
}

/** 所有點位共用同一個圖示尺寸（px），只隨縮放等級一起變大變小 */
export function iconSizeAt(zoom: number): number {
  if (zoom <= 12) return 20;
  if (zoom <= 13) return 22;
  if (zoom <= 14) return 24;
  if (zoom <= 15) return 26;
  return 30;
}

// 圖示先畫成高解析度的點陣圖，canvas 再依目前尺寸縮放貼上
const BITMAP_PX = 96;
const bitmapCache = new Map<string, HTMLImageElement>();
function bitmap(icon: IconSpec, onReady: () => void): HTMLImageElement {
  const key = `${icon.glyph}|${icon.color}`;
  let img = bitmapCache.get(key);
  if (!img) {
    img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(stickerSvg(icon, BITMAP_PX, true));
    bitmapCache.set(key, img);
  }
  if (!img.complete) img.addEventListener("load", onReady, { once: true });
  return img;
}

// 用 canvas 畫的標記：沿用 CircleMarker 的點擊判定、tooltip、canvas 效能，
// 只把「畫圓」換成「貼圖示」
/* eslint-disable @typescript-eslint/no-explicit-any */
const IconMarker = L.CircleMarker.extend({
  _project(this: any) {
    this._radius = iconSizeAt(this._map.getZoom()) / 2;
    (L.CircleMarker.prototype as any)._project.call(this);
  },
  _updatePath(this: any) {
    const renderer = this._renderer;
    if (!renderer._drawing || this._empty()) return;
    const img: HTMLImageElement = this.options.image;
    if (!img.complete || !img.naturalWidth) return;
    const size = this._radius * 2;
    renderer._ctx.drawImage(img, this._point.x - this._radius, this._point.y - this._radius, size, size);
  },
}) as unknown as new (latlng: L.LatLngExpression, options: L.CircleMarkerOptions & { image: HTMLImageElement }) => L.CircleMarker;

/* eslint-enable @typescript-eslint/no-explicit-any */

export type LabeledPoint = LatLngPoint & { label?: string };

export interface PoiGroup {
  key: string;
  icon: IconSpec;
  label: string;
  points: LabeledPoint[];
  /** 數字越大畫在越上面 */
  order?: number;
}

/**
 * 所有開啟的圖層一起畫：每個點都畫成圖示，只畫目前畫面（加一點外圍）裡的點。
 * order 大的圖層畫在上面。
 */
export function PoiLayer({ groups, pane = PANES.top }: { groups: PoiGroup[]; pane?: string }) {
  const map = useMap();
  const renderer = useMemo(() => L.canvas({ pane, padding: 0.3 }), [pane]);

  // 依 order 排好，order 大的後畫、蓋在上面
  const ordered = useMemo(
    () => groups.map((group, g) => ({ group, g })).sort((a, b) => (a.group.order ?? 0) - (b.group.order ?? 0)),
    [groups]
  );

  useEffect(() => {
    const layer = L.layerGroup().addTo(map);
    const redraw = () => (renderer as unknown as { _redraw?: () => void })._redraw?.();
    const images = groups.map((group) => bitmap(group.icon, redraw));

    const render = () => {
      layer.clearLayers();
      const b = map.getBounds().pad(0.3);
      for (const { group, g } of ordered) {
        for (const p of group.points) {
          if (!b.contains([p.lat, p.lng])) continue;
          new IconMarker([p.lat, p.lng], { renderer, pane, image: images[g], stroke: false, fill: false, interactive: true })
            .bindTooltip(p.label ?? group.label, { direction: "top", offset: [0, -8] })
            .addTo(layer);
        }
      }
    };

    render();
    map.on("moveend", render);
    return () => {
      map.off("moveend", render);
      layer.remove();
    };
  }, [map, renderer, pane, groups, ordered]);

  return null;
}
