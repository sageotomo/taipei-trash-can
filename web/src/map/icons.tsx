// 點位圖示：每種點位用不同的彩色小插圖，一眼就看得出是什麼。
// 不論縮放多少，每個點都直接畫成圖示（不聚集成數字），
// 全部畫在 canvas 上，上萬個點也不會卡。

import { useCallback, useEffect, useMemo, useRef } from "react";
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

// ---------------- 圖片點位（滿桶狀況的垃圾桶圖示） ----------------

export interface ImagePointStyle {
  /** 圖片網址（public 底下的相對路徑） */
  src: string;
  /** 相對於一般尺寸的倍數 */
  scale?: number;
  /** 選取時在圖示外面加一圈框線 */
  ring?: string;
  /** 畫在其他點上面 */
  front?: boolean;
}

/** 圖示本體約占整張圖的比例（其餘是陰影和留白），點擊範圍只算本體 */
const IMAGE_CONTENT = 0.82;

const imageCache = new Map<string, HTMLImageElement>();
function loadImage(src: string, onReady: () => void): HTMLImageElement {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imageCache.set(src, img);
  }
  if (!img.complete) img.addEventListener("load", onReady, { once: true });
  return img;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const ImageMarker = L.CircleMarker.extend({
  _project(this: any) {
    const ringPx = iconSizeAt(this._map.getZoom()) * (this.options.scale ?? 1);
    this._ringRadius = ringPx / 2;
    this._radius = ringPx / IMAGE_CONTENT / 2;
    (L.CircleMarker.prototype as any)._project.call(this);
  },
  _containsPoint(this: any, p: L.Point) {
    return p.distanceTo(this._point) <= this._ringRadius + this._clickTolerance();
  },
  _updatePath(this: any) {
    const renderer = this._renderer;
    if (!renderer._drawing || this._empty()) return;
    const ctx: CanvasRenderingContext2D = renderer._ctx;
    const { x, y } = this._point;
    if (this.options.ring) {
      ctx.beginPath();
      ctx.arc(x, y, this._ringRadius + 2.5, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.options.ring;
      ctx.stroke();
    }
    const img: HTMLImageElement = this.options.image;
    if (!img.complete || !img.naturalWidth) return;
    const r = this._radius;
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  },
}) as unknown as new (latlng: L.LatLngExpression, options: L.CircleMarkerOptions & Record<string, unknown>) => L.CircleMarker;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface ImagePointLayerProps {
  points: LatLngPoint[];
  style: (index: number) => ImagePointStyle;
  pane?: string;
  onClick?: (index: number) => void;
  tooltip?: (index: number) => string | undefined;
}

/** 每個點畫成一張圖片（畫在 canvas 上），用法和 PointLayer 一樣 */
export function ImagePointLayer({ points, style, pane = PANES.points, onClick, tooltip }: ImagePointLayerProps) {
  const map = useMap();
  const renderer = useMemo(() => L.canvas({ pane, padding: 0.3 }), [pane]);
  const markers = useRef<L.CircleMarker[]>([]);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const tooltipRef = useRef(tooltip);
  tooltipRef.current = tooltip;
  const styleRef = useRef(style);
  styleRef.current = style;

  const redraw = useMemo(() => () => (renderer as unknown as { _redraw?: () => void })._redraw?.(), [renderer]);
  const options = useCallback(
    (s: ImagePointStyle) => ({
      image: loadImage(s.src, redraw),
      scale: s.scale ?? 1,
      ring: s.ring ?? null,
    }),
    [redraw]
  );

  const applyStyles = useCallback(() => {
    const front: L.CircleMarker[] = [];
    markers.current.forEach((m, i) => {
      const s = styleRef.current(i);
      L.setOptions(m, options(s));
      const mm = m as unknown as { _map?: L.Map; _project(): void };
      if (mm._map) mm._project();
      if (s.front) front.push(m);
    });
    front.forEach((m) => m.bringToFront());
    redraw();
  }, [options, redraw]);

  useEffect(() => {
    const group = L.layerGroup();
    markers.current = points.map((p, i) => {
      const m = new ImageMarker([p.lat, p.lng], { renderer, pane, stroke: false, fill: false, ...options(styleRef.current(i)) });
      if (onClickRef.current) {
        m.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onClickRef.current?.(i);
        });
      }
      const tip = tooltipRef.current?.(i);
      if (tip) m.bindTooltip(tip, { direction: "top", offset: [0, -8] });
      m.addTo(group);
      return m;
    });
    group.addTo(map);
    applyStyles();
    return () => {
      group.remove();
    };
  }, [points, map, renderer, pane, options, applyStyles]);

  useEffect(() => {
    applyStyles();
  }, [style, applyStyles]);

  return null;
}
