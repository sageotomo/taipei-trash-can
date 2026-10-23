// pipeline 輸出的 JSON 格式（見 pipeline/03_grid.py），以及共用型別

/** 地圖圖示：圖形＋底色 */
export interface IconSpec {
  glyph: string;  // map/icons.tsx 的 GLYPHS key
  color: string;
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
  cell: string;
  fill_rate: number;
  simulated: boolean;
}

export type PoiKind = "mrt" | "bus" | "youbike" | "shop";
export interface PoiProps {
  kind: PoiKind;
  name?: string;
  daily_flow?: number;
  district?: string;  // 只有捷運站有
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
  occurred_at?: string; // 問題發生的時間 YYYY-MM-DDTHH:mm（市民填的；歷史通報沒有）
  district?: string;
  cell: string;
  simulated?: boolean;
  local?: boolean; // 這台瀏覽器新增的
  photo?: string;   // 檢舉照片（壓縮後的 JPEG data URL），只有網頁上新增的通報有
  contact?: string; // 市民留的 email 或電話（選填），追蹤處理進度用
  qr?: boolean;     // 掃垃圾桶 QR code 送出、存在伺服器的通報（lib/qrFeed.ts）
  bin?: string;     // 掃碼通報的垃圾桶編號
}

export interface Source {
  key: string;
  label: string;
  real: boolean;
  /** 推估：輸入是真實資料，但它和指標之間的關係是假設，沒有實際觀測（real 為 false） */
  assumption?: boolean;
  note: string;                              // 真實：資料來源說明；模擬：模擬方法
  links?: { label: string; url: string }[];  // 真實資料的開放資料網址
}

export type Strategy = "A" | "B";

/** 智慧垃圾桶設備資料（pipeline/05_smart_bins.py，模擬）；順序和 bins.geojson 相同 */
export interface SmartBin {
  battery: number; // 0–100
  brand: string;
  sponsor: string;
}

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

/** 增桶進度（模擬，lib/progress.ts 產生） */
export interface ProgressItem {
  /** 本週前 30 名的名次；已動工但掉出前 30 名的點為 null */
  rank: number | null;
  cell: string;
  lat: number;
  lng: number;
  district: string;
  status: ProgressStatus;
  /** 第一次進入前 30 名的那週（週一） */
  since: string;
  updated_at: string;
  owner: string;
  simulated: boolean;
}
