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

export type Strategy = "A" | "B";

export interface FillSummary {
  overflow_hours: number;
  trips: number;
  bins_ever_full: number;
}

/** pipeline/04_fill_sim.py 的輸出；陣列順序和 bins.geojson 相同 */
export interface FillData {
  hours: number;
  fixed_hours: number[];
  dispatch_at: number;
  hourly: number[];
  levels: Record<Strategy, number[][]>; // [桶][小時] 0–100，100 代表滿溢
  overflow: Record<Strategy, number[]>; // 每桶 7 天內滿溢的小時數
  trips: Record<Strategy, number[]>;
  summary: Record<Strategy, FillSummary>;
}

export type ProgressStatus = "已設置" | "施工中" | "規劃中" | "未處理";

/** pipeline/05_progress.py 的輸出（模擬） */
export interface ProgressItem {
  rank: number;
  h3: string;
  lat: number;
  lng: number;
  district: string;
  status: ProgressStatus;
  updated_at: string;
  owner: string;
  simulated: boolean;
}
