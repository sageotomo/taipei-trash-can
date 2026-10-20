// 把 pipeline 產生的資料轉成「圖層」（一堆點，每點算好所在格子）。
// 地圖顯示和缺桶指數的計算都用這些圖層。

import { latLngToCell } from "./hexgrid";
import { POI_TYPES } from "./glyphs";
import type { AppData } from "../data";
import type { DataLayer, LayerPoint } from "./indicators";
import type { Report } from "../types";

export const BUILTIN_LAYER_IDS = ["mrt", "bus", "youbike", "drinks", "food", "bins", "residential", "reports"] as const;

function point(lat: number, lng: number, name?: string, values?: Record<string, number>, tag?: string): LayerPoint {
  return { lat, lng, cell: latLngToCell(lat, lng), name, values, tag };
}

/** 格子編號不會因為權重改變，所以垃圾桶、捷運等固定圖層只算一次 */
export function staticLayers(data: AppData): DataLayer[] {
  const by: Record<string, LayerPoint[]> = { mrt: [], bus: [], youbike: [], drinks: [], food: [] };
  for (const f of data.pois.features) {
    const [lng, lat] = f.geometry.coordinates;
    const p = f.properties;
    if (p.kind === "mrt") by.mrt.push(point(lat, lng, p.name, { flow: p.daily_flow ?? 0 }));
    // 飲料店和餐飲店分成兩個圖層：飲料店密集代表商圈（逛街手上有空杯），可以單獨當指標
    else if (p.kind === "shop") (p.type === "drink" ? by.drinks : by.food).push(point(lat, lng, p.name));
    else by[p.kind].push(point(lat, lng, p.name));
  }
  const bins = data.bins.features.map((f) =>
    point(f.geometry.coordinates[1], f.geometry.coordinates[0], f.properties.id, { fill: Math.round(f.properties.fill_rate * 1000) / 10 })
  );

  const residential = data.residential.features.map((f) =>
    point(f.geometry.coordinates[1], f.geometry.coordinates[0], undefined, { homes: f.properties.homes ?? 1 })
  );

  return [
    { id: "mrt", label: "捷運站", unit: "站", icon: POI_TYPES.mrt, source: "mrt", points: by.mrt,
      fields: [{ key: "flow", label: "每日進出人次", unit: "人次" }] },
    { id: "bus", label: "公車站", unit: "站", icon: POI_TYPES.bus, source: "bus", points: by.bus, fields: [] },
    { id: "youbike", label: "YouBike 站", unit: "站", icon: POI_TYPES.youbike, source: "youbike", points: by.youbike, fields: [] },
    { id: "drinks", label: "飲料店", unit: "家", icon: POI_TYPES.drink, source: "shops", points: by.drinks, fields: [] },
    { id: "food", label: "餐飲店", unit: "家", icon: POI_TYPES.food, source: "shops", points: by.food, fields: [] },
    { id: "bins", label: "現有垃圾桶", unit: "個", icon: POI_TYPES.bins, source: "bins", points: bins,
      fields: [{ key: "fill", label: "填滿速度", unit: "%/小時" }] },
    { id: "residential", label: "住宅區", unit: "處", icon: POI_TYPES.residential, source: "residential", points: residential,
      fields: [{ key: "homes", label: "住家門牌", unit: "個" }] },
  ];
}

/** 市民通報會隨使用者新增而變動，所以分開建立 */
export function reportsLayer(reports: Report[]): DataLayer {
  return {
    id: "reports", label: "市民通報", unit: "件", icon: POI_TYPES.report, source: "reports", fields: [],
    points: reports.map((r) => ({ lat: r.lat, lng: r.lng, cell: r.cell, name: r.category })),
  };
}
