// 使用者的指標設定存在這台裝置的瀏覽器（localStorage），重新整理後還在。
// 無痕模式或封鎖網站資料時讀寫可能失敗，都包在 try/catch 裡；失敗就用預設值。

import { DEFAULT_INDICATORS, type Indicator } from "./indicators";

const INDICATORS_KEY = "trash-bins:indicators:v1";

function isIndicator(x: unknown): x is Indicator {
  const i = x as Indicator;
  return (
    typeof i === "object" && i !== null &&
    typeof i.id === "string" && typeof i.label === "string" && typeof i.layer === "string" &&
    (i.method === "count" || (i.method === "sum" && typeof i.field === "string")) &&
    (i.sign === 1 || i.sign === -1) &&
    typeof i.weight === "number" && Number.isFinite(i.weight) &&
    (i.cap === null || (typeof i.cap === "number" && i.cap > 0))
  );
}

export function loadIndicators(): Indicator[] {
  try {
    const raw = localStorage.getItem(INDICATORS_KEY);
    if (!raw) return DEFAULT_INDICATORS;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isIndicator) ? parsed : DEFAULT_INDICATORS;
  } catch {
    return DEFAULT_INDICATORS;
  }
}

export function saveIndicators(list: Indicator[]): void {
  try {
    localStorage.setItem(INDICATORS_KEY, JSON.stringify(list));
  } catch {
    // 存不了就只在這次瀏覽有效
  }
}
