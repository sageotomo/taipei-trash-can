// 掃 QR code 的通報：網頁（report.html）和伺服器（worker/index.ts）共用的格式與檢查。
// 伺服器一定會重新檢查一次，網頁上的檢查只是讓市民先知道哪裡填錯。

import { CATEGORIES, OCCURRED_MAX_DAYS, type Category } from "./reports";

export const NOTE_MAX = 200;
export const CONTACT_MAX = 100;
/** 一次通報的 JSON 最多幾個位元組（沒有照片，正常不到 1 KB） */
export const BODY_MAX_BYTES = 4096;

/** 垃圾桶編號：B＋四碼，例如 B0365 */
export const BIN_ID = /^B\d{4}$/;

/** 網頁送給伺服器的內容 */
export interface QrReportInput {
  bin: string;
  category: Category;
  /** 問題發生的時間 YYYY-MM-DDTHH:mm（台灣時間） */
  occurredAt: string;
  note: string;
  contact: string;
  /** Turnstile 驗證碼 */
  token: string;
}

/** 伺服器回給儀表板的一筆通報（不含聯絡方式） */
export interface QrReportOut {
  id: string;
  bin: string;
  category: Category;
  note: string;
  occurred_at: string;
  created_at: string; // YYYY-MM-DD（台灣時間）
  has_contact: boolean;
}

const TW_OFFSET_MS = 8 * 3_600_000;

/** 台灣時間 YYYY-MM-DDTHH:mm → 毫秒；格式錯回傳 NaN */
export function parseTaipei(v: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return NaN;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return NaN;
  return Date.UTC(y, mo - 1, d, h, mi) - TW_OFFSET_MS;
}

/** 毫秒 → 台灣時間 YYYY-MM-DD */
export function taipeiDate(ms: number): string {
  return new Date(ms + TW_OFFSET_MS).toISOString().slice(0, 10);
}

/** 毫秒 → 台灣時間 YYYY-MM-DDTHH:mm */
export function taipeiDateTime(ms: number): string {
  return new Date(ms + TW_OFFSET_MS).toISOString().slice(0, 16);
}

// email 或台灣電話（市話、手機，可有 - 和空白）；不追求完全正確，只擋明顯亂填
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,63}\.[^\s@]{2,24}$/;
const PHONE = /^\+?[\d\s-]{8,16}$/;

/** 拿掉控制字元（換行保留），去頭尾空白 */
function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "").trim();
}

export type Checked = { ok: true; value: QrReportInput } | { ok: false; error: string };

/** 檢查市民送來的內容；沒問題回傳整理過的值 */
export function checkQrReport(raw: unknown, now = Date.now()): Checked {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "格式不對。" };
  const r = raw as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");

  const bin = str("bin");
  if (!BIN_ID.test(bin)) return { ok: false, error: "垃圾桶編號不對。" };

  const category = str("category") as Category;
  if (!CATEGORIES.includes(category)) return { ok: false, error: "請選擇通報類別。" };

  const occurredAt = str("occurredAt");
  const t = parseTaipei(occurredAt);
  if (Number.isNaN(t)) return { ok: false, error: "請填問題發生的日期和時間。" };
  if (t > now + 5 * 60_000) return { ok: false, error: "發生時間不能晚於現在。" };
  if (t < now - OCCURRED_MAX_DAYS * 86_400_000) return { ok: false, error: `只能通報 ${OCCURRED_MAX_DAYS} 天內發生的問題。` };

  const note = clean(str("note"));
  if ([...note].length > NOTE_MAX) return { ok: false, error: `說明最多 ${NOTE_MAX} 字。` };

  const contact = clean(str("contact"));
  if (contact.length > CONTACT_MAX) return { ok: false, error: `聯絡方式最多 ${CONTACT_MAX} 字。` };
  if (contact && !EMAIL.test(contact) && !PHONE.test(contact)) return { ok: false, error: "聯絡方式請填 email 或電話。" };

  const token = str("token");
  if (!token || token.length > 2048) return { ok: false, error: "請先完成「我不是機器人」驗證。" };

  return { ok: true, value: { bin, category, occurredAt, note, contact, token } };
}
