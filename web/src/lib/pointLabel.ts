import type { DataLayer } from "./indicators";
import { escapeHtml, fmtValue } from "../ui";

/** 地圖上一個點的說明框內容（HTML） */
export function pointLabel(
  layer: DataLayer, p: DataLayer["points"][number], simulated: boolean, title = layer.label,
  isSim: (source?: string) => boolean = () => false,
): string {
  const head = p.name ? `${escapeHtml(title)}：${escapeHtml(p.name)}` : escapeHtml(title);
  // 住宅區：只列真實的住家門牌數；住宅值和商圈程度是自訂的，不顯示數字，只說明關係
  const v = p.values;
  if (layer.id === "residential" && v?.door !== undefined) {
    return `${head}<br>住家門牌 ${fmtValue(v.door, "戶")} 戶`
      + `<br>住宅值：隨住家門牌數增加，隨商圈程度降低`
      + (simulated ? "（模擬）" : "");
  }
  const extra = layer.fields
    .filter((f) => p.values?.[f.key] !== undefined)
    // 欄位來源和圖層不同（例如真實垃圾桶上的模擬填滿速度）時，在欄位旁標「模擬」
    .map((f) => escapeHtml(`${f.label} ${fmtValue(p.values![f.key], f.unit)}${f.unit ? ` ${f.unit}` : ""}${!simulated && f.source && isSim(f.source) ? "（模擬）" : ""}`))
    .join("・");
  return head + (extra ? `<br>${extra}` : "") + (simulated ? "（模擬）" : "");
}
