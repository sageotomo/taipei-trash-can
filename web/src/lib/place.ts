import { hexCenter } from "./hex";
import type { AppData } from "../data";

function distanceM(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** 每格的地點描述，例如「中正區・台北車站旁」或「大安區・離科技大樓站 600 m」 */
export function placeNames(data: AppData): string[] {
  const stations = data.pois.features
    .filter((f) => f.properties.kind === "mrt")
    .map((f) => ({ name: f.properties.name ?? "", at: [f.geometry.coordinates[1], f.geometry.coordinates[0]] as [number, number] }));

  return data.grid.map((cell) => {
    const c = hexCenter(cell.h3);
    let best = { name: "", d: Infinity };
    for (const s of stations) {
      const d = distanceM(c, s.at);
      if (d < best.d) best = { name: s.name, d };
    }
    if (best.d < 250) return `${cell.district}・${best.name}站旁`;
    if (best.d < 1500) return `${cell.district}・離${best.name}站 ${Math.round(best.d / 100) * 100} m`;
    return cell.district;
  });
}
