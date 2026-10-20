import type { AppData } from "../data";

function distanceM(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export interface Placer {
  /** 「中正區・台北車站旁」或「大安區・離科技大樓站 600 m」 */
  (at: [number, number], district?: string): string;
  /** 行政區：用最近的捷運站所在行政區近似 */
  district: (at: [number, number]) => string;
}

export function makePlacer(data: AppData): Placer {
  const stations = data.pois.features
    .filter((f) => f.properties.kind === "mrt")
    .map((f) => ({
      name: f.properties.name ?? "",
      district: f.properties.district ?? "",
      at: [f.geometry.coordinates[1], f.geometry.coordinates[0]] as [number, number],
    }));

  const nearest = (at: [number, number]) => {
    let best = { name: "", district: "", d: Infinity };
    for (const s of stations) {
      const d = distanceM(at, s.at);
      if (d < best.d) best = { name: s.name, district: s.district, d };
    }
    return best;
  };

  const place = ((at: [number, number], district?: string): string => {
    const best = nearest(at);
    const d = district ?? best.district;
    const station = best.name.endsWith("站") ? best.name : `${best.name}站`;
    if (best.d < 250) return `${d}・${station}旁`;
    if (best.d < 1500) return `${d}・離${station} ${Math.round(best.d / 100) * 100} m`;
    return d;
  }) as Placer;
  place.district = (at) => nearest(at).district;
  return place;
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
