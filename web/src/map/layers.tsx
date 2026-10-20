// 直接用 Leaflet API 畫大量的六角形和點，並畫在 canvas 上。
// 上千個圖形若每個都是 React 元件，拖滑桿時會很卡；這裡只在樣式改變時呼叫 setStyle。

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { hexBoundary } from "../lib/hex";

export const PANES = { hexes: "hexes", points: "points", top: "top" } as const;

/** 建立圖層順序：六角網格在下、點在上 */
export function MapPanes() {
  const map = useMap();
  useMemo(() => {
    const z: Record<string, number> = { hexes: 350, points: 450, top: 460 };
    for (const [name, zIndex] of Object.entries(z)) {
      if (!map.getPane(name)) map.createPane(name).style.zIndex = String(zIndex);
    }
  }, [map]);
  return null;
}

function useCanvas(pane: string) {
  return useMemo(() => L.canvas({ pane, padding: 0.3 }), [pane]);
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

interface HexLayerProps {
  cells: string[];
  style: (index: number) => L.PathOptions;
  onClick?: (index: number) => void;
  tooltip?: (index: number) => string;
}

export function HexLayer({ cells, style, onClick, tooltip }: HexLayerProps) {
  const map = useMap();
  const renderer = useCanvas(PANES.hexes);
  const shapes = useRef<L.Polygon[]>([]);
  const onClickRef = useLatest(onClick);
  const tooltipRef = useLatest(tooltip);
  const styleRef = useLatest(style);

  useEffect(() => {
    const group = L.layerGroup();
    shapes.current = cells.map((cell, i) => {
      const poly = L.polygon(hexBoundary(cell), { renderer, pane: PANES.hexes, ...styleRef.current(i) });
      poly.on("click", () => onClickRef.current?.(i));
      if (tooltipRef.current) poly.bindTooltip(() => tooltipRef.current?.(i) ?? "", { sticky: true, direction: "top" });
      poly.addTo(group);
      return poly;
    });
    group.addTo(map);
    return () => {
      group.remove();
    };
  }, [cells, map, renderer, onClickRef, tooltipRef, styleRef]);

  useEffect(() => {
    shapes.current.forEach((p, i) => p.setStyle(style(i)));
  }, [style]);

  return null;
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

interface PointLayerProps {
  points: LatLngPoint[];
  style: (index: number) => L.CircleMarkerOptions;
  pane?: string;
  onClick?: (index: number) => void;
  tooltip?: (index: number) => string | undefined;
}

export function PointLayer({ points, style, pane = PANES.points, onClick, tooltip }: PointLayerProps) {
  const map = useMap();
  const renderer = useCanvas(pane);
  const markers = useRef<L.CircleMarker[]>([]);
  const onClickRef = useLatest(onClick);
  const tooltipRef = useLatest(tooltip);
  const styleRef = useLatest(style);

  useEffect(() => {
    const group = L.layerGroup();
    markers.current = points.map((p, i) => {
      const m = L.circleMarker([p.lat, p.lng], { renderer, pane, ...styleRef.current(i) });
      if (onClickRef.current) {
        m.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onClickRef.current?.(i);
        });
      }
      const tip = tooltipRef.current?.(i);
      if (tip) m.bindTooltip(tip, { direction: "top" });
      m.addTo(group);
      return m;
    });
    group.addTo(map);
    return () => {
      group.remove();
    };
  }, [points, map, renderer, pane, onClickRef, tooltipRef, styleRef]);

  useEffect(() => {
    markers.current.forEach((m, i) => m.setStyle(style(i)));
  }, [style]);

  return null;
}

/** 收到新的 focus 就飛過去 */
export function FlyTo({ target }: { target: { lat: number; lng: number; zoom?: number; key: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? 16, { duration: 0.8 });
  }, [target, map]);
  return null;
}

/** 地圖點擊（不含點到圖形） */
export function MapClick({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  const map = useMap();
  const ref = useLatest(onClick);
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => ref.current(e.latlng.lat, e.latlng.lng);
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map, ref]);
  return null;
}

/** 面板寬度改變後，讓 Leaflet 重新量地圖大小 */
export function InvalidateSize({ dep }: { dep: unknown }) {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 50);
    return () => window.clearTimeout(id);
  }, [dep, map]);
  return null;
}
