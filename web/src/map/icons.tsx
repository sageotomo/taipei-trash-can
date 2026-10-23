// 點位圖示：每種點位用不同的可愛貼紙圖示，一眼就看得出是什麼。
// 所有圖層用同一個尺寸，畫在 canvas 上，點再多也不會退回成圓點。

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { PANES, type LatLngPoint } from "./layers";
import type { IconSpec } from "../types";

import { GLYPHS } from "../lib/glyphs";
export { CUSTOM_COLORS, CUSTOM_GLYPHS, GLYPHS, POI_TYPES, type PoiType } from "../lib/glyphs";

/** 貼紙風格的完整圖示 SVG：白色粗邊、柔和陰影、左上一點反光，中間是可愛的白色圖案 */
export function stickerSvg(icon: IconSpec, px: number, withNs = false): string {
  const glyph = (GLYPHS[icon.glyph] ?? GLYPHS.pin).path.replaceAll("{accent}", icon.color);
  return (
    `<svg ${withNs ? 'xmlns="http://www.w3.org/2000/svg" ' : ""}viewBox="0 0 24 24" width="${px}" height="${px}" aria-hidden="true">` +
    `<circle cx="12" cy="12.8" r="11" fill="rgba(70,45,35,0.3)"/>` +
    `<circle cx="12" cy="12" r="11" fill="#fff"/>` +
    `<circle cx="12" cy="12" r="9.3" fill="${icon.color}"/>` +
    `<ellipse cx="7.6" cy="6.4" rx="2.6" ry="1.3" transform="rotate(-35 7.6 6.4)" fill="rgba(255,255,255,0.35)"/>` +
    `<g transform="translate(12 12) scale(0.74) translate(-12 -12)">${glyph}</g>` +
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
  if (zoom <= 12) return 13;
  if (zoom <= 13) return 15;
  if (zoom <= 14) return 18;
  if (zoom <= 15) return 21;
  return 25;
}

// 圖示先畫成高解析度的點陣圖，canvas 再依目前尺寸縮放貼上
const BITMAP_PX = 64;
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

// 用 canvas 畫的圖示標記：沿用 CircleMarker 的點擊判定、tooltip、canvas 效能，
// 只把「畫圓」換成「貼圖示」，所以上萬個點也能全部顯示成圖示
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

interface Props {
  icon: IconSpec;
  label: string;
  points: LabeledPoint[];
  pane?: string;
}

/** 一個圖層的所有點：任何縮放等級都畫成同樣大小的圖示 */
export function PoiPointLayer({ icon, label, points, pane = PANES.points }: Props) {
  const map = useMap();
  const renderer = useMemo(() => L.canvas({ pane, padding: 0.3 }), [pane]);

  useEffect(() => {
    const group = L.layerGroup();
    const redraw = () => (renderer as unknown as { _redraw?: () => void })._redraw?.();
    const image = bitmap(icon, redraw);
    for (const p of points) {
      new IconMarker([p.lat, p.lng], { renderer, pane, image, stroke: false, fill: false, interactive: true })
        .bindTooltip(p.label ?? label, { direction: "top", offset: [0, -6] })
        .addTo(group);
    }
    group.addTo(map);
    return () => {
      group.remove();
    };
  }, [map, renderer, pane, icon, label, points]);

  return null;
}
