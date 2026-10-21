// Cloudflare Worker：只處理 /api/*，其他網址交給靜態網站（wrangler.jsonc 的 run_worker_first）。
//
// 掃 QR code 通報的後端。設計目標是 demo 當天網站公開時，任何人都無法灌爆資料庫或伺服器：
//   1. 總量上限：資料庫最多 MAX_REPORTS 筆，滿了就拒收（同一個 SQL 指令裡檢查，不會超過）
//   2. 頻率限制：同一個 IP、以及整體每分鐘的送出次數（Cloudflare Rate Limiting）
//   3. Turnstile：擋腳本大量送出；驗證碼只能用一次
//   4. 伺服器重新檢查所有欄位；位置由垃圾桶編號決定，不收使用者送的座標；不存在的桶直接拒絕
//   5. 聯絡方式只存不回傳：GET /api/reports 永遠不含 email／電話
//   6. 讀取有快取與頻率限制，避免有人狂刷把 D1 免費讀取額度用光

import { BODY_MAX_BYTES, BIN_ID, checkQrReport, taipeiDate, type QrReportOut } from "../src/lib/qrReport";
import type { Category } from "../src/lib/reports";

const MAX_REPORTS = 2000;

// Turnstile 官方測試金鑰（一定會通過）。還沒設定正式金鑰之前先用這組，設定後自動換成正式的。
const TEST_SITE_KEY = "1x00000000000000000000AA";
const TEST_SECRET = "1x0000000000000000000000000000000AA";

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  /** 還沒在 wrangler.jsonc 綁定 D1 時是 undefined */
  DB?: D1Database;
  /** 同一個 IP 送出通報：每分鐘 10 次（現場大家共用 Wi-Fi 會是同一個 IP，所以不能太嚴） */
  POST_IP_LIMIT: RateLimit;
  /** 整體送出通報（每個 Cloudflare 機房分開算）：每分鐘 60 次 */
  POST_ALL_LIMIT: RateLimit;
  /** 同一個 IP 讀取：每分鐘 60 次 */
  GET_IP_LIMIT: RateLimit;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
}

const SECURITY_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, "cache-control": "no-store", ...extra } });
}
const fail = (status: number, error: string) => json({ error }, status);

// ---------- 垃圾桶清單（從靜態網站讀一次，存在記憶體） ----------

interface BinInfo {
  id: string;
  road: string;
  district: string;
}
let binsPromise: Promise<Map<string, BinInfo>> | null = null;

function loadBins(env: Env, url: URL): Promise<Map<string, BinInfo>> {
  binsPromise ??= env.ASSETS.fetch(new Request(new URL("/data/bins.geojson", url.origin)))
    .then((r) => {
      if (!r.ok) throw new Error(`bins.geojson ${r.status}`);
      return r.json() as Promise<{ features: { properties: BinInfo }[] }>;
    })
    .then((fc) => new Map(fc.features.map(({ properties: { id, road, district } }) => [id, { id, road, district }])))
    .catch((e) => {
      binsPromise = null; // 下次再試
      throw e;
    });
  return binsPromise;
}

// ---------- 資料庫 ----------

let schemaReady: Promise<unknown> | null = null;
function ensureSchema(db: D1Database): Promise<unknown> {
  schemaReady ??= db
    .exec(
      "CREATE TABLE IF NOT EXISTS qr_reports (id TEXT PRIMARY KEY, bin TEXT NOT NULL, category TEXT NOT NULL, note TEXT NOT NULL, contact TEXT NOT NULL, occurred_at TEXT NOT NULL, created_ms INTEGER NOT NULL)"
    )
    .catch((e) => {
      schemaReady = null;
      throw e;
    });
  return schemaReady;
}

function newId(now: number): string {
  const d = taipeiDate(now); // YYYY-MM-DD
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const tail = Array.from(bytes, (b) => "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"[b % 34]).join("");
  return `Q${d.slice(5, 7)}${d.slice(8, 10)}-${tail}`;
}

// 讀取快取：同一個 Worker 執行個體 10 秒內重複讀取不查資料庫（workers.dev 網址不能用 Cache API）
let listCache: { at: number; body: string } | null = null;
const LIST_TTL_MS = 10_000;

// ---------- Turnstile ----------

function turnstileKeys(env: Env): { siteKey: string; secret: string } | null {
  const siteKey = env.TURNSTILE_SITE_KEY || TEST_SITE_KEY;
  if (siteKey === TEST_SITE_KEY) return { siteKey, secret: TEST_SECRET };
  // 設了正式 site key 卻沒有 secret：寧可拒收，也不要在沒有保護的情況下收資料
  return env.TURNSTILE_SECRET ? { siteKey, secret: env.TURNSTILE_SECRET } : null;
}

async function verifyTurnstile(secret: string, token: string, ip: string): Promise<boolean> {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const out = (await r.json()) as { success?: boolean };
    return out.success === true;
  } catch {
    return false;
  }
}

// ---------- 路由 ----------

async function handleConfig(req: Request, env: Env, url: URL): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") ?? "";
  if (!(await env.GET_IP_LIMIT.limit({ key: `get:${ip}` })).success) return fail(429, "太頻繁了，請稍後再試。");
  const keys = turnstileKeys(env);
  const bin = url.searchParams.get("bin") ?? "";
  if (!BIN_ID.test(bin)) return json({ siteKey: keys?.siteKey ?? null, bin: null });
  const bins = await loadBins(env, url);
  return json({ siteKey: keys?.siteKey ?? null, bin: bins.get(bin) ?? null });
}

async function handleCreate(req: Request, env: Env, url: URL): Promise<Response> {
  // 只接受從自己網站送出的 JSON
  const origin = req.headers.get("origin");
  if (origin && origin !== url.origin) return fail(403, "不接受其他網站送出的通報。");
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return fail(415, "格式不對。");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > BODY_MAX_BYTES) return fail(413, "內容太長。");

  const ip = req.headers.get("cf-connecting-ip") ?? "";
  if (!(await env.POST_IP_LIMIT.limit({ key: `post:${ip}` })).success) return fail(429, "送出太頻繁了，請一分鐘後再試。");
  if (!(await env.POST_ALL_LIMIT.limit({ key: "post:all" })).success) return fail(429, "現在通報的人太多，請稍後再試。");

  // 實際讀取時也限制長度（content-length 可以造假）
  const text = await req.text();
  if (new TextEncoder().encode(text).length > BODY_MAX_BYTES) return fail(413, "內容太長。");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail(400, "格式不對。");
  }

  const now = Date.now();
  const checked = checkQrReport(raw, now);
  if (!checked.ok) return fail(400, checked.error);
  const v = checked.value;

  const bins = await loadBins(env, url);
  if (!bins.has(v.bin)) return fail(400, "找不到這個垃圾桶。");

  const keys = turnstileKeys(env);
  if (!keys) return fail(503, "通報功能暫停中。");
  if (!(await verifyTurnstile(keys.secret, v.token, ip))) return fail(403, "「我不是機器人」驗證失敗，請重新整理再試一次。");

  await ensureSchema(env.DB!);
  const id = newId(now);
  // 總量上限在同一個 SQL 指令裡檢查，同時送出也不會超過
  const res = await env.DB!.prepare(
    "INSERT INTO qr_reports (id, bin, category, note, contact, occurred_at, created_ms) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE (SELECT COUNT(*) FROM qr_reports) < ?8"
  )
    .bind(id, v.bin, v.category, v.note, v.contact, v.occurredAt, now, MAX_REPORTS)
    .run();
  if (!res.meta.changes) return fail(507, "通報數量已達展示上限，謝謝參與！");

  listCache = null;
  return json({ id }, 201);
}

async function handleList(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") ?? "";
  if (!(await env.GET_IP_LIMIT.limit({ key: `get:${ip}` })).success) return fail(429, "太頻繁了，請稍後再試。");
  const headers = { "cache-control": "no-store" };
  if (listCache && Date.now() - listCache.at < LIST_TTL_MS) return new Response(listCache.body, { headers: { ...SECURITY_HEADERS, ...headers } });

  await ensureSchema(env.DB!);
  const { results } = await env.DB!.prepare(
    "SELECT id, bin, category, note, occurred_at, created_ms, contact != '' AS has_contact FROM qr_reports ORDER BY created_ms DESC LIMIT ?1"
  )
    .bind(MAX_REPORTS)
    .all<{ id: string; bin: string; category: Category; note: string; occurred_at: string; created_ms: number; has_contact: number }>();
  const reports: QrReportOut[] = results.map((r) => ({
    id: r.id,
    bin: r.bin,
    category: r.category,
    note: r.note,
    occurred_at: r.occurred_at,
    created_at: taipeiDate(r.created_ms),
    has_contact: !!r.has_contact,
  }));
  const body = JSON.stringify({ reports });
  listCache = { at: Date.now(), body };
  return new Response(body, { headers: { ...SECURITY_HEADERS, ...headers } });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      if (!env.DB && url.pathname === "/api/reports") return fail(503, "通報功能尚未設定。");
      if (url.pathname === "/api/config" && req.method === "GET") return await handleConfig(req, env, url);
      if (url.pathname === "/api/reports" && req.method === "POST") return await handleCreate(req, env, url);
      if (url.pathname === "/api/reports" && req.method === "GET") return await handleList(req, env);
      return fail(404, "找不到。");
    } catch (e) {
      console.error(e);
      return fail(500, "伺服器暫時出錯，請稍後再試。");
    }
  },
};
