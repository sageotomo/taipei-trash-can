// pipeline 輸出的 JSON 格式（見 pipeline/03_grid.py）

export type FeatureKey = "mrt" | "bus" | "youbike" | "food" | "reports" | "fill";
export type Weights = Record<FeatureKey, number>;

export interface GridCell {
  h3: string;
  district: string;
  bins: number;   // 本格清潔箱數
  nbins: number;  // 相鄰 6 格清潔箱數
  // 原始值
  mrt: number;
  bus: number;
  youbike: number;
  food: number;
  reports: number;
  fill: number;
  // 已標準化 0–1（reports 在瀏覽器裡標準化）
  mrt_n: number;
  bus_n: number;
  youbike_n: number;
  food_n: number;
  fill_n: number;
}

export interface PointFeature<P> {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: P;
}

export interface FeatureCollection<P> {
  type: "FeatureCollection";
  features: PointFeature<P>[];
}

export interface BinProps {
  id: string;
  district: string;
  road: string;
  h3: string;
  fill_rate: number;
  simulated: boolean;
}

export type PoiKind = "mrt" | "bus" | "youbike" | "shop";
export interface PoiProps {
  kind: PoiKind;
  name?: string;
  daily_flow?: number;
  type?: "drink" | "food";
  simulated: boolean;
}

export interface Report {
  id: string;
  category: string;
  note?: string;
  lat: number;
  lng: number;
  created_at: string;
  district?: string;
  h3: string;
  simulated?: boolean;
  local?: boolean; // 這台瀏覽器新增的
}

export interface Source {
  key: string;
  label: string;
  real: boolean;
  note: string;
}
