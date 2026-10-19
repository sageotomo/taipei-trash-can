import { useEffect, useState } from "react";
import type { BinProps, FeatureCollection, FillData, GridCell, PoiProps, Report, Source } from "./types";

export interface AppData {
  grid: GridCell[];
  bins: FeatureCollection<BinProps>;
  pois: FeatureCollection<PoiProps>;
  reportsSeed: Report[];
  sources: Source[];
  fill: FillData;
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
      load<GridCell[]>("grid.json"),
      load<FeatureCollection<BinProps>>("bins.geojson"),
      load<FeatureCollection<PoiProps>>("pois.geojson"),
      load<Report[]>("reports_seed.json"),
      load<Source[]>("sources.json"),
      load<FillData>("fill.json"),
    ])
      .then(([grid, bins, pois, reportsSeed, sources, fill]) => {
        if (!cancelled) setData({ grid, bins, pois, reportsSeed, sources, fill });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}
