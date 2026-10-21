// 掃垃圾桶上的 QR code 後打開的通報頁（report.html?bin=B0365）。
// 不載入地圖和儀表板，手機上很快就能填。位置由垃圾桶編號決定，市民不用選地點。
// 送出到 /api/reports，伺服器會重新檢查並做 Turnstile 驗證（worker/index.ts）。

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CATEGORIES, OCCURRED_MAX_DAYS, localDateTime, occurredError, type Category } from "../lib/reports";
import { BIN_ID, CONTACT_MAX, NOTE_MAX, checkQrReport } from "../lib/qrReport";

interface BinInfo {
  id: string;
  road: string;
  district: string;
}

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; bin: BinInfo; siteKey: string | null };

const CATEGORY_HINT: Record<Category, string> = {
  亂丟垃圾: "垃圾桶附近有人亂丟、地上很髒",
  垃圾桶滿溢: "桶子滿了、垃圾滿出來",
  家戶垃圾棄置: "有人把家裡整包垃圾丟在這裡",
};

// ---------- Turnstile ----------

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScript: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  turnstileScript ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => {
      turnstileScript = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return turnstileScript;
}

function Turnstile(props: { siteKey: string; onToken: (t: string) => void; resetKey: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const { siteKey, onToken, resetKey } = props;
  useEffect(() => {
    let id: string | undefined;
    let api: TurnstileApi | undefined;
    let cancelled = false;
    onToken("");
    loadTurnstile()
      .then((t) => {
        if (cancelled || !box.current) return;
        api = t;
        id = t.render(box.current, {
          sitekey: siteKey,
          language: "zh-tw",
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (api && id) api.remove(id);
    };
  }, [siteKey, onToken, resetKey]);
  return (
    <div className="ts">
      <div ref={box} />
      {failed ? <p className="err">「我不是機器人」驗證載入失敗，請檢查網路後重新整理。</p> : null}
    </div>
  );
}

// ---------- 頁面 ----------

export function ReportPage() {
  const binId = new URLSearchParams(location.search).get("bin") ?? "";
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!BIN_ID.test(binId)) {
      setLoad({ state: "error", message: "這個 QR code 沒有對應的垃圾桶編號。" });
      return;
    }
    fetch(`./api/config?bin=${encodeURIComponent(binId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "載入失敗");
        return r.json() as Promise<{ siteKey: string | null; bin: BinInfo | null }>;
      })
      .then(({ siteKey, bin }) =>
        setLoad(bin ? { state: "ready", bin, siteKey } : { state: "error", message: `找不到垃圾桶 ${binId}。` })
      )
      .catch((e: Error) => setLoad({ state: "error", message: `${e.message}，請稍後重新整理。` }));
  }, [binId]);

  return (
    <main className="rp">
      <header className="rp-head">
        <p className="kicker">找回消失的垃圾桶・市民通報</p>
        {load.state === "ready" ? (
          <>
            <h1>這個垃圾桶怎麼了？</h1>
            <p className="bin">
              <span className="bin-id">{load.bin.id}</span>
              {load.bin.district}　{load.bin.road}
            </p>
          </>
        ) : (
          <h1>垃圾桶通報</h1>
        )}
      </header>

      {load.state === "loading" ? <p className="muted">載入中…</p> : null}
      {load.state === "error" ? <p className="err card">{load.message}</p> : null}
      {load.state === "ready" && load.siteKey === null ? <p className="err card">通報功能暫停中，請稍後再試。</p> : null}

      {load.state === "ready" && load.siteKey && done ? (
        <section className="card done" aria-live="polite">
          <h2>已送出，謝謝你！</h2>
          <p>
            案件編號 <strong className="case-id">{done}</strong>
          </p>
          <p className="muted">通報會出現在市府的通報案件表，由負責的清潔隊處理。</p>
          <button type="button" className="secondary" onClick={() => setDone(null)}>
            再通報一件
          </button>
        </section>
      ) : null}

      {load.state === "ready" && load.siteKey && !done ? (
        <ReportForm bin={load.bin} siteKey={load.siteKey} onDone={setDone} />
      ) : null}

      <footer className="rp-foot muted">
        這是市政 debug松 的展示作品，不是臺北市政府的正式通報管道。緊急狀況請撥 1999。
      </footer>
    </main>
  );
}

function ReportForm(props: { bin: BinInfo; siteKey: string; onDone: (id: string) => void }) {
  const [category, setCategory] = useState<Category | "">("");
  const [occurredAt, setOccurredAt] = useState(() => localDateTime());
  const [note, setNote] = useState("");
  const [contact, setContact] = useState("");
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const onToken = useCallback((t: string) => setToken(t), []);
  const noteLen = [...note].length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    if (!category) return setError("請選擇通報類別。");
    const occ = occurredError(occurredAt);
    if (occ) return setError(occ);
    const body = { bin: props.bin.id, category, occurredAt, note, contact, token };
    const checked = checkQrReport(body);
    if (!checked.ok) return setError(checked.error);

    setSending(true);
    setError(null);
    try {
      const r = await fetch("./api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (r.ok && out.id) {
        props.onDone(out.id);
        return;
      }
      setError(out.error ?? "送出失敗，請稍後再試。");
    } catch {
      setError("網路連線失敗，請稍後再試。");
    } finally {
      setSending(false);
    }
    // 驗證碼只能用一次，失敗後要重新驗證
    setResetKey((k) => k + 1);
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <fieldset>
        <legend>發生什麼事？</legend>
        <div className="cats">
          {CATEGORIES.map((c) => (
            <label key={c} className={`cat${category === c ? " on" : ""}`}>
              <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} />
              <strong>{c}</strong>
              <small>{CATEGORY_HINT[c]}</small>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>什麼時候發生的？</span>
        <input
          type="datetime-local"
          required
          value={occurredAt}
          max={localDateTime()}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
        <small className="muted">預設是現在；可以填 {OCCURRED_MAX_DAYS} 天內的時間。</small>
      </label>

      <label className="field">
        <span>
          補充說明 <small className="muted">（選填）</small>
        </span>
        <textarea rows={3} value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="例如：晚上 10 點後常常滿出來" />
        <small className="muted count">
          {noteLen}／{NOTE_MAX}
        </small>
      </label>

      <label className="field">
        <span>
          email 或手機 <small className="muted">（選填）</small>
        </span>
        <input
          type="text"
          inputMode="email"
          autoComplete="email"
          value={contact}
          maxLength={CONTACT_MAX}
          onChange={(e) => setContact(e.target.value)}
          placeholder="想知道處理進度再留"
        />
        <small className="muted">只給承辦單位回覆用，不會公開顯示。</small>
      </label>

      <Turnstile siteKey={props.siteKey} onToken={onToken} resetKey={resetKey} />

      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="primary" disabled={sending || !token}>
        {sending ? "送出中…" : token ? "送出通報" : "請先完成驗證"}
      </button>
    </form>
  );
}
