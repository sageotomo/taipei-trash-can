// 試辦區（大安區、中山區）垃圾桶的負責清潔分隊。
//
// 分隊名稱、電話：臺北市環保局「業務職掌－區清潔隊」（中山區 2026-09-17 更新；大安區取自環保局 OpenData）。
// 官方的「里 → 分隊」責任區劃分沒有可直接用的開放資料，所以這裡是模擬：
// 每個分隊取一個代表點（分隊名稱所指的路段、分隊駐點附近），垃圾桶歸給同一行政區裡最近的代表點。
// 結果都落在相鄰、連續的路段上，Demo 警示的和平東路二段 3 桶會歸和平分隊（見 squads.test.ts）。

export interface Squad {
  district: string;
  /** 「和平分隊」 */
  name: string;
  phone: string;
  /** 代表點（模擬責任區的中心） */
  lat: number;
  lng: number;
}

export const SQUADS: Squad[] = [
  // 大安區清潔隊（隊部 02-2737-1303）
  { district: "大安區", name: "和平分隊", phone: "02-2362-5869", lat: 25.025, lng: 121.542 }, // 和平東路二段
  { district: "大安區", name: "瑞安分隊", phone: "02-2363-4850", lat: 25.0265, lng: 121.537 }, // 建國南路二段駐點
  { district: "大安區", name: "台大分隊", phone: "02-2363-3215", lat: 25.019, lng: 121.534 }, // 台大、辛亥路一段
  { district: "大安區", name: "新生分隊", phone: "02-2752-9383", lat: 25.031, lng: 121.53 }, // 新生南路、愛國東路
  { district: "大安區", name: "安和分隊", phone: "02-2737-4644", lat: 25.031, lng: 121.552 }, // 安和路、通化街
  { district: "大安區", name: "敦化分隊", phone: "02-2778-6724", lat: 25.041, lng: 121.549 }, // 敦化南路一段、忠孝東路四段
  { district: "大安區", name: "臥龍分隊", phone: "02-2378-5530", lat: 25.0205, lng: 121.552 }, // 臥龍街、基隆路
  // 中山區清潔隊（隊部 02-2502-2264）
  { district: "中山區", name: "圓山分隊", phone: "02-2593-6222", lat: 25.0715, lng: 121.524 }, // 圓山、花博、美術館
  { district: "中山區", name: "大直分隊", phone: "02-2533-8564", lat: 25.08, lng: 121.547 }, // 大直
  { district: "中山區", name: "中山分隊", phone: "02-2511-0958", lat: 25.054, lng: 121.526 }, // 林森北路、新生北路二段
  { district: "中山區", name: "長安分隊", phone: "02-2777-5545", lat: 25.049, lng: 121.533 }, // 長安東路、松江路南段
  { district: "中山區", name: "南京分隊", phone: "02-2713-2687", lat: 25.052, lng: 121.539 }, // 南京東路三段、長春路
  { district: "中山區", name: "民一分隊", phone: "02-2509-8870", lat: 25.064, lng: 121.533 }, // 民權東路二段、松江路北段
  { district: "中山區", name: "民二分隊", phone: "02-2509-3774", lat: 25.061, lng: 121.542 }, // 民權東路三段、榮星
];

// 台北緯度一帶，經度 1 度的距離約為緯度 1 度的 0.906 倍
const LNG_SCALE = Math.cos((25.05 * Math.PI) / 180);

/** 這個桶歸哪個分隊；不在試辦區（沒有分隊資料的行政區）回傳 null */
export function squadOf(district: string, lat: number, lng: number): Squad | null {
  let best: Squad | null = null;
  let bestD = Infinity;
  for (const s of SQUADS) {
    if (s.district !== district) continue;
    const d = (s.lat - lat) ** 2 + ((s.lng - lng) * LNG_SCALE) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** 通知上用的分隊全名：「大安區」+「和平分隊」→「大安和平分隊」 */
export function squadLabel(s: Squad): string {
  return `${s.district.replace(/區$/, "")}${s.name}`;
}
