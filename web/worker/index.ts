// Cloudflare Worker：只處理 /api/*，其他網址交給靜態網站（wrangler.jsonc 的 run_worker_first）。
//
// 掃 QR code 的通報存在一個 Durable Object（內建 SQLite）。不用在 Cloudflare 後台建任何資料庫，
// 每個分支預覽也會自動有一份獨立、從空的開始的資料。
// 整個網站有 Cloudflare Access 保護，只有團隊能用，所以這裡只做基本的格式檢查與數量上限。
//
//   POST /api/reports        新增一筆通報
//   GET  /api/reports        所有通報（不含照片內容，只有 has_photo）
//   GET  /api/photo/<id>     某筆通報的照片（JPEG）

import { DurableObject } from "cloudflare:workers";
import { CATEGORIES } from "../src/lib/reports";

const MAX_REPORTS = 500;
const MAX_BODY = 600_000; // 照片壓縮後約 60–120 KB，base64 再大三分之一
const PHOTO_PREFIX = "data:image/jpeg;base64,";

export interface StoredReport {
  id: string;
  bin: string;
  category: string;
  occurred_at: string;
  note: string;
  contact: string;
  created_ms: number;
  has_photo: number;
}

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  REPORTS: DurableObjectNamespace<ReportStore>;
}

export class ReportStore extends DurableObject<Env> {
  constructor(ctx: ConstructorParameters<typeof DurableObject>[0], env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, bin TEXT, category TEXT, occurred_at TEXT, note TEXT, contact TEXT, photo TEXT, created_ms INTEGER)"
    );
  }

  /** 回傳新編號；滿了回傳 null */
  add(r: { bin: string; category: string; occurred_at: string; note: string; contact: string; photo: string }): string | null {
    const sql = this.ctx.storage.sql;
    const { n } = sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM reports").one();
    if (n >= MAX_REPORTS) return null;
    const now = Date.now();
    const id = newId(now);
    sql.exec(
      "INSERT INTO reports (id, bin, category, occurred_at, note, contact, photo, created_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id, r.bin, r.category, r.occurred_at, r.note, r.contact, r.photo, now
    );
    return id;
  }

  list(): StoredReport[] {
    return this.ctx.storage.sql
      .exec<StoredReport>(
        "SELECT id, bin, category, occurred_at, note, contact, created_ms, photo != '' AS has_photo FROM reports ORDER BY created_ms"
      )
      .toArray();
  }

  photo(id: string): string | null {
    const rows = this.ctx.storage.sql.exec<{ photo: string }>("SELECT photo FROM reports WHERE id = ?", id).toArray();
    return rows[0]?.photo || null;
  }
}

/** Q＋月日（台灣時間）＋四碼，例如 Q1023-7K3M */
function newId(now: number): string {
  const d = new Date(now + 8 * 3_600_000).toISOString();
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const tail = Array.from(bytes, (b) => "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"[b % 34]).join("");
  return `Q${d.slice(5, 7)}${d.slice(8, 10)}-${tail}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
const fail = (status: number, error: string) => json({ error }, status);

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function create(req: Request, store: ReportStore): Promise<Response> {
  const text = await req.text();
  if (text.length > MAX_BODY) return fail(413, "照片太大，請換一張。");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, "格式不對。");
  }
  const bin = str(body.bin, 10);
  const category = str(body.category, 20);
  const occurred_at = str(body.occurredAt, 16);
  const photo = str(body.photo, MAX_BODY);
  if (!/^B\d{4}$/.test(bin)) return fail(400, "垃圾桶編號不對。");
  if (!(CATEGORIES as readonly string[]).includes(category)) return fail(400, "請選擇類別。");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(occurred_at)) return fail(400, "請填發生時間。");
  if (photo && !photo.startsWith(PHOTO_PREFIX)) return fail(400, "照片格式不對。");
  const id = await store.add({ bin, category, occurred_at, note: str(body.note, 200), contact: str(body.contact, 100), photo });
  return id ? json({ id }, 201) : fail(507, `已經有 ${MAX_REPORTS} 筆通報，展示用的空間滿了。`);
}

async function photo(id: string, store: ReportStore): Promise<Response> {
  const data = await store.photo(id);
  if (!data) return new Response("not found", { status: 404 });
  const bin = Uint8Array.from(atob(data.slice(PHOTO_PREFIX.length)), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    const store = env.REPORTS.getByName("demo");
    try {
      if (url.pathname === "/api/reports" && req.method === "POST") return await create(req, store);
      if (url.pathname === "/api/reports" && req.method === "GET") return json({ reports: await store.list() });
      const m = /^\/api\/photo\/(Q\d{4}-[0-9A-Z]{4})$/.exec(url.pathname);
      if (m && req.method === "GET") return await photo(m[1], store);
      return fail(404, "找不到。");
    } catch (e) {
      console.error(e);
      return fail(500, "伺服器暫時出錯，請稍後再試。");
    }
  },
};
