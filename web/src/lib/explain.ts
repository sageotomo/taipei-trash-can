// 點一格時的說明：用一句話講這格是「不缺／還夠用／有點缺／缺／很缺」哪一級，以及為什麼。
// 不顯示指數數字和計算過程，只講格內有哪些情境在增加或降低垃圾桶需求。

export interface Factor {
  /** 情境名稱，例如「飲料店（商圈）」 */
  label: string;
  /** 格內數量，例如「2 家」；不適合顯示數量的情境給空字串 */
  amount: string;
  /** 1 = 增加需求，-1 = 降低需求 */
  sign: 1 | -1;
  /** 格內有沒有這種情境 */
  present: boolean;
  /** 對指數的影響大小（帶正負號），用來排序 */
  term: number;
}

const MAX_LISTED = 3;

const name = (f: Factor) => (f.amount ? `${f.label} ${f.amount}` : f.label);

function list(fs: Factor[], withAmount = true): string {
  const shown = fs.slice(0, MAX_LISTED).map((f) => (withAmount ? name(f) : f.label));
  return shown.join("、") + (fs.length > MAX_LISTED ? " 等" : "");
}

/** level = null 代表「不缺」（指數 0） */
export function explainLevel(level: string | null, factors: Factor[]): string {
  const ups = factors.filter((f) => f.sign > 0 && f.present).sort((a, b) => b.term - a.term);
  const downs = factors.filter((f) => f.sign < 0 && f.present).sort((a, b) => a.term - b.term);
  const missingDowns = factors.filter((f) => f.sign < 0 && !f.present);

  if (level === null) {
    if (ups.length === 0) return "這一格裡沒有會增加垃圾桶需求的情境，所以判定為「不缺」。";
    return `這一格雖然有${list(ups)}，但${list(downs)}降低了需求，抵銷之後判定為「不缺」。`;
  }

  let text = `判定為「${level}」，主要是因為格內有${list(ups)}，這些都會增加垃圾桶需求`;
  if (downs.length > 0) text += `；雖然也有${list(downs)}會降低需求，但不足以抵銷`;
  else if (missingDowns.length > 0) text += `，而且格內沒有${list(missingDowns, false)}，需求沒有被抵銷`;
  return text + "。";
}
