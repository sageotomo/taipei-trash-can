// 點位圖示：每種點位用不同的圖示標記，一眼就看得出是什麼。
// 所有圖層用同一個尺寸，畫在 canvas 上，點再多也不會退回成圓點。

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { PANES, type LatLngPoint } from "./layers";
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

/** 所有點位共用同一個圖示尺寸（px），只隨縮放等級一起變大變小 */
export function iconSizeAt(zoom: number): number {
  if (zoom <= 12) return 12;
  if (zoom <= 13) return 14;
  if (zoom <= 14) return 16;
  if (zoom <= 15) return 19;
  return 22;
}

// 圖示先畫成高解析度的點陣圖，canvas 再依目前尺寸縮放貼上
const BITMAP_PX = 64;
const bitmapCache = new Map<string, HTMLImageElement>();
function bitmap(icon: IconSpec, onReady: () => void): HTMLImageElement {
  const key = `${icon.glyph}|${icon.color}`;
  let img = bitmapCache.get(key);
  if (!img) {
    const path = (GLYPHS[icon.glyph] ?? GLYPHS.pin).path;
    const svgText =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${BITMAP_PX}" height="${BITMAP_PX}">` +
      `<circle cx="12" cy="12" r="11.4" fill="rgba(0,0,0,0.45)"/>` +
      `<circle cx="12" cy="12" r="10.6" fill="${icon.color}" stroke="#fff" stroke-width="1.4"/>` +
      `<g transform="translate(12 12) scale(0.62) translate(-12 -12)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</g>` +
      `</svg>`;
    img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
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
