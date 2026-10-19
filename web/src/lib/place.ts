import { hexCenter } from "./hex";
import type { AppData } from "../data";

function distanceM(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** 建立一個函式：給經緯度和行政區，回傳「中正區・台北車站旁」或「大安區・離科技大樓站 600 m」 */
export function makePlacer(data: AppData) {
  const stations = data.pois.features
    .filter((f) => f.properties.kind === "mrt")
    .map((f) => ({ name: f.properties.name ?? "", at: [f.geometry.coordinates[1], f.geometry.coordinates[0]] as [number, number] }));

  return (at: [number, number], district: string): string => {
    let best = { name: "", d: Infinity };
    for (const s of stations) {
      const d = distanceM(at, s.at);
      if (d < best.d) best = { name: s.name, d };
    }
    const station = best.name.endsWith("站") ? best.name : `${best.name}站`;
    if (best.d < 250) return `${district}・${station}旁`;
    if (best.d < 1500) return `${district}・離${station} ${Math.round(best.d / 100) * 100} m`;
    return district;
  };
}

/** 每個網格的地點描述，和 grid 同順序 */
export function placeNames(data: AppData): string[] {
  const place = makePlacer(data);
  return data.grid.map((cell) => place(hexCenter(cell.h3), cell.district));
}

/** 每個清潔箱的地點描述，和 bins.geojson 同順序 */
export function binPlaceNames(data: AppData): string[] {
  const place = makePlacer(data);
  return data.bins.features.map((f) => {
    const [lng, lat] = f.geometry.coordinates;
    const road = f.properties.road ? `${f.properties.road}・` : "";
    return road + place([lat, lng], f.properties.district);
  });
}
