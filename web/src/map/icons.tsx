// 點位圖示：每種點位用不同的彩色小插圖，一眼就看得出是什麼。
// 縮小地圖時，附近的點會聚集成橘色的數字圓圈（用 supercluster 計算），
// 全部畫在 canvas 上，上萬個點也不會卡。

import { useCallback, useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import Supercluster, { type ClusterFeature, type PointFeature } from "supercluster";
import { useMap } from "react-leaflet";
import { PANES, type LatLngPoint } from "./layers";
import type { IconSpec } from "../types";

import { CLUSTER_COLOR, GLYPHS } from "../lib/glyphs";
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

/** 數字圓圈的直徑（px）：數量越多圈越大 */
export function clusterSizeAt(count: number): number {
  if (count < 10) return 28;
  if (count < 100) return 32;
  if (count < 1000) return 38;
  return 44;
}

/** 放大到這個縮放等級以上，就不再聚集，每個點都畫成圖示 */
export const CLUSTER_MAX_ZOOM = 16;

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
// 只把「畫圓」換成「貼圖示」或「畫數字圓圈」
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

const ClusterMarker = L.CircleMarker.extend({
  _project(this: any) {
    this._radius = clusterSizeAt(this.options.count) / 2;
    (L.CircleMarker.prototype as any)._project.call(this);
  },
  _updatePath(this: any) {
    const renderer = this._renderer;
    if (!renderer._drawing || this._empty()) return;
    const ctx: CanvasRenderingContext2D = renderer._ctx;
    const { x, y } = this._point;
    const r = this._radius;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r - 2.5, 0, Math.PI * 2);
    ctx.fillStyle = CLUSTER_COLOR;
    ctx.fill();
    const count: number = this.options.count;
    const text = count >= 10000 ? `${Math.round(count / 1000)}k` : String(count);
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${text.length >= 4 ? 12 : 14}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 0.5);
  },
}) as unknown as new (latlng: L.LatLngExpression, options: L.CircleMarkerOptions & { count: number }) => L.CircleMarker;
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

type PointProps = { g: number; i: number };
type ClusterProps = { counts: Record<number, number> };

/**
 * 所有開啟的圖層一起聚集：縮小時附近的點合併成橘色數字圓圈（滑鼠移上去看各類數量，點一下放大），
 * 放大到 CLUSTER_MAX_ZOOM 以上每個點都畫成圖示。
 */
export function ClusteredPoiLayer({ groups, pane = PANES.top }: { groups: PoiGroup[]; pane?: string }) {
  const map = useMap();
  const renderer = useMemo(() => L.canvas({ pane, padding: 0.3 }), [pane]);

  const index = useMemo(() => {
    const sc = new Supercluster<PointProps, ClusterProps>({
      radius: 56,
      maxZoom: CLUSTER_MAX_ZOOM - 1,
      map: (p) => ({ counts: { [p.g]: 1 } }),
      reduce: (acc, p) => {
        for (const k in p.counts) acc.counts[k] = (acc.counts[k] ?? 0) + p.counts[k];
      },
    });
    const features: PointFeature<PointProps>[] = [];
    groups.forEach((group, g) =>
      group.points.forEach((p, i) =>
        features.push({ type: "Feature", properties: { g, i }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })
      )
    );
    sc.load(features);
    return sc;
  }, [groups]);

  useEffect(() => {
    const layer = L.layerGroup().addTo(map);
    const redraw = () => (renderer as unknown as { _redraw?: () => void })._redraw?.();
    const images = groups.map((group) => bitmap(group.icon, redraw));

    const render = () => {
      layer.clearLayers();
      const b = map.getBounds().pad(0.3);
      const zoom = Math.round(map.getZoom());
      const items = index.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom);
      const singles: { g: number; i: number }[] = [];
      const clusters: ClusterFeature<ClusterProps>[] = [];
      for (const f of items) {
        if ("cluster" in f.properties && f.properties.cluster) clusters.push(f as ClusterFeature<ClusterProps>);
        else singles.push(f.properties as PointProps);
      }
      singles.sort((a, b) => (groups[a.g].order ?? 0) - (groups[b.g].order ?? 0));
      for (const { g, i } of singles) {
        const group = groups[g];
        const p = group.points[i];
        new IconMarker([p.lat, p.lng], { renderer, pane, image: images[g], stroke: false, fill: false, interactive: true })
          .bindTooltip(p.label ?? group.label, { direction: "top", offset: [0, -8] })
          .addTo(layer);
      }
      for (const c of clusters) {
        const [lng, lat] = c.geometry.coordinates;
        const count = c.properties.point_count;
        const parts = Object.entries(c.properties.counts as Record<string, number>)
          .sort((a, b) => b[1] - a[1])
          .map(([g, n]) => `${groups[Number(g)].label} ${n.toLocaleString()}`);
        new ClusterMarker([lat, lng], { renderer, pane, count, stroke: false, fill: false, interactive: true, bubblingMouseEvents: false })
          .bindTooltip(`<b>${count.toLocaleString()} 個地點</b><br>${parts.join("、")}<br><small>點一下放大</small>`, {
            direction: "top",
            offset: [0, -10],
          })
          .on("click", () => {
            const next = Math.min(index.getClusterExpansionZoom(c.properties.cluster_id), CLUSTER_MAX_ZOOM);
            map.flyTo([lat, lng], Math.max(next, map.getZoom() + 1));
          })
          .addTo(layer);
      }
    };

    render();
    map.on("moveend", render);
    return () => {
      map.off("moveend", render);
      layer.remove();
    };
  }, [map, renderer, pane, index, groups]);

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
