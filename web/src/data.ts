import { useEffect, useState } from "react";
import type { BinProps, FeatureCollection, FillData, PoiProps, Report, SmartBin, Source } from "./types";

/** 住宅區：homes = 住家門牌數（真實資料時每格一點；模擬時每點 1） */
export type ResidentialProps = { homes?: number; simulated: boolean };

export interface AppData {
  bins: FeatureCollection<BinProps>;
  pois: FeatureCollection<PoiProps>;
  reportsSeed: Report[];
  sources: Source[];
  fill: FillData;
  smartBins: SmartBin[];
  residential: FeatureCollection<ResidentialProps>;
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
      load<FeatureCollection<PoiProps>>("pois.geojson"),
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
