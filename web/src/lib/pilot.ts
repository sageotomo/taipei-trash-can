// 填滿度感測器的試辦區：動態調度只看這兩區的垃圾桶（模擬感測器只先裝在這裡）。
// 邊界是 web/public/data/pilot_districts.geojson（內政部 1:1 萬鄉鎮界，來源見 data/NOTES.md）。

import type { BinProps, FeatureCollection, FillData, FillSummary, Strategy } from "../types";

export const PILOT_DISTRICTS = ["大安區", "中山區"] as const;

export const PILOT_LABEL = PILOT_DISTRICTS.join("、");

export interface PilotArea {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: { district: string; code?: string };
    geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };
  }[];
}

export function isPilot(district: string): boolean {
  return (PILOT_DISTRICTS as readonly string[]).includes(district);
}

/** 試辦區裡的垃圾桶索引（保持原本順序） */
export function pilotBinIndices(bins: FeatureCollection<BinProps>): number[] {
  return bins.features.flatMap((f, i) => (isPilot(f.properties.district) ? [i] : []));
}

/** 只算試辦區的一週清運模擬合計（每桶的滿溢小時數、出車次數相加） */
export function pilotSummary(fill: FillData, pilot: number[], s: Strategy): FillSummary {
  const overflow = pilot.map((i) => fill.overflow[s][i]);
  return {
    overflow_hours: overflow.reduce((a, b) => a + b, 0),
    trips: pilot.reduce((a, i) => a + fill.trips[s][i], 0),
    bins_ever_full: overflow.filter((v) => v > 0).length,
  };
}

/** GeoJSON 的 [lng, lat] 外框 → Leaflet 的 [lat, lng]（多邊形可能是 MultiPolygon） */
export function areaOutlines(area: PilotArea): { district: string; rings: [number, number][][] }[] {
  return area.features.map((f) => {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    return {
      district: f.properties.district,
      rings: polys.map((p) => p[0].map(([lng, lat]) => [lat, lng] as [number, number])),
    };
  });
}
