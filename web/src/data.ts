import { useEffect, useState } from "react";
import type { BinProps, FeatureCollection, FillData, PoiProps, Report, SmartBin, Source } from "./types";

/** 住宅區：homes = 住家門牌數（真實資料時每格一點；模擬時每點 1） */
/** door = 住家門牌、biz = 商圈程度（0～1），homes = door ×（1 − biz） */
export type ResidentialProps = { homes?: number; door?: number; biz?: number; simulated: boolean };

export interface AppData {
  bins: FeatureCollection<BinProps>;
  pois: FeatureCollection<PoiProps>;
  reportsSeed: Report[];
  sources: Source[];
  fill: FillData;
  smartBins: SmartBin[];
  residential: FeatureCollection<ResidentialProps>;
}

/** pipeline/03_grid.py 輸出的 pois.json：同一類點位存成欄位式，比 GeoJSON 小約 3 倍 */
export interface PoiColumns {
  groups: {
    kind: PoiProps["kind"];
    simulated: boolean;
    lng: number[];
    lat: number[];
    props: Record<string, (string | number | null)[]>;
  }[];
}

/** 轉回網頁其他地方用的 GeoJSON；沒有值（null）的欄位省略，和舊的 pois.geojson 相同 */
export function poisFromColumns(c: PoiColumns): FeatureCollection<PoiProps> {
  const features: FeatureCollection<PoiProps>["features"] = [];
  for (const g of c.groups) {
    const keys = Object.keys(g.props);
    for (let i = 0; i < g.lat.length; i++) {
      const p: Record<string, unknown> = { kind: g.kind };
      for (const k of keys) {
        const v = g.props[k][i];
        if (v !== null && v !== "") p[k] = v;
      }
      p.simulated = g.simulated;
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: [g.lng[i], g.lat[i]] }, properties: p as unknown as PoiProps });
    }
  }
  return { type: "FeatureCollection", features };
}

async function load<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
  if (!res.ok) throw new Error(`讀不到 data/${name}（${res.status}）。請先在專案根目錄執行 make all。`);
  return res.json() as Promise<T>;
}

export function useAppData() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      load<FeatureCollection<BinProps>>("bins.geojson"),
      load<PoiColumns>("pois.json").then(poisFromColumns),
      load<Report[]>("reports_seed.json"),
      load<Source[]>("sources.json"),
      load<FillData>("fill.json"),
      load<FeatureCollection<ResidentialProps>>("residential.geojson"),
      load<SmartBin[]>("smart_bins.json"),
    ])
      .then(([bins, pois, reportsSeed, sources, fill, residential, smartBins]) => {
        if (!cancelled) setData({ bins, pois, reportsSeed, sources, fill, residential, smartBins });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}
