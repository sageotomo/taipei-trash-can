// 使用者的指標設定與匯入的圖層存在這台裝置的瀏覽器（localStorage），重新整理後還在。
// 無痕模式或封鎖網站資料時讀寫可能失敗，都包在 try/catch 裡；失敗就用預設值。

import { DEFAULT_INDICATORS, dedupeIndicators, type DataLayer, type Indicator } from "./indicators";
import { latLngToCell } from "./hexgrid";

// v2：預設指標改成七個故事、飲料店與餐飲店拆成兩個圖層
// v3：住宅區改成「住家門牌數」加總；舊版的設定不再讀取
// v4：捷運人流改成開根號（√(這格 ÷ 最大的那格)）
// v5：預設指標拿掉捷運人流（和飲料店的族群重疊）
const INDICATORS_KEY = "trash-bins:indicators:v5";

function isIndicator(x: unknown): x is Indicator {
  const i = x as Indicator;
  return (
    typeof i === "object" && i !== null &&
    typeof i.id === "string" && typeof i.label === "string" && typeof i.layer === "string" &&
    (i.method === "count" || (i.method === "sum" && typeof i.field === "string")) &&
    (i.sign === 1 || i.sign === -1) &&
    typeof i.weight === "number" && Number.isFinite(i.weight) &&
    (i.cap === null || (typeof i.cap === "number" && i.cap > 0)) &&
    (i.enabled === undefined || typeof i.enabled === "boolean") &&
    (i.curve === undefined || i.curve === "linear" || i.curve === "sqrt")
  );
}

export function loadIndicators(): Indicator[] {
  try {
    const raw = localStorage.getItem(INDICATORS_KEY);
    if (!raw) return DEFAULT_INDICATORS;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isIndicator) ? inDefaultOrder(dedupeIndicators(parsed)) : DEFAULT_INDICATORS;
  } catch {
    return DEFAULT_INDICATORS;
  }
}

/** 存過的設定也照預設的故事順序排（調整故事順序後不用清掉使用者的權重）；自訂指標維持原本順序，排在後面 */
export function inDefaultOrder(list: Indicator[]): Indicator[] {
  const rank = new Map(DEFAULT_INDICATORS.map((d, i) => [d.id, i]));
  const builtIn = list.filter((i) => rank.has(i.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...builtIn, ...list.filter((i) => !rank.has(i.id))];
}

export function saveIndicators(list: Indicator[]): void {
  try {
    localStorage.setItem(INDICATORS_KEY, JSON.stringify(list));
  } catch {
    // 存不了就只在這次瀏覽有效
  }
}

// ---------------- 匯入的圖層 ----------------

const LAYERS_KEY = "trash-bins:layers:v1";

type StoredPoint = [number, number, string?, Record<string, number>?];
interface StoredLayer extends Omit<DataLayer, "points"> {
  points: StoredPoint[];
}

export function loadCustomLayers(): DataLayer[] {
  try {
    const raw = localStorage.getItem(LAYERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredLayer[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => typeof l?.id === "string" && Array.isArray(l.points) && Array.isArray(l.fields) && l.icon)
      .map((l) => ({
        ...l,
        custom: true,
        points: l.points
          .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
          .map(([lat, lng, name, values]) => ({ lat, lng, cell: latLngToCell(lat, lng), name, values })),
      }));
  } catch {
    return [];
  }
}

/** 回傳是否存成功（檔案太大時瀏覽器可能拒絕） */
export function saveCustomLayers(layers: DataLayer[]): boolean {
  try {
    const stored: StoredLayer[] = layers.map(({ points, ...rest }) => ({
      ...rest,
      points: points.map((p): StoredPoint => [p.lat, p.lng, p.name, p.values]),
    }));
    localStorage.setItem(LAYERS_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}
