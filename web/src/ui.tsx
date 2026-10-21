import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Source } from "./types";
import { ROLES, type Role } from "./lib/role";

/** 畫面右上角的使用者身分切換（沒有登入，只是切換視角） */
export function RoleToggle({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div className="role-toggle" role="group" aria-label="切換使用者身分">
      <span className="role-toggle-label">使用者身分</span>
      {ROLES.map((r) => (
        <button key={r.id} className={role === r.id ? "on" : ""} aria-pressed={role === r.id} onClick={() => onChange(r.id)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 每個資料都標示真實或模擬，這是黑客松規則要求的。推估（assumption）是模擬的一種：
 * 輸入是真實資料，但它和指標的關係沒有實際觀測，所以不能標成真實資料。
 * 旁邊的「!」：滑鼠移上去（手機點一下）顯示說明。真實資料寫來源與網址，模擬資料寫模擬方法。
 * 說明框用 position: fixed 定位，才不會被可捲動的側邊欄裁掉。
 */
export function SourceTag({ source }: { source?: Source }) {
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const tipId = useId();

  const show = () => {
    window.clearTimeout(closeTimer.current);
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(TIP_WIDTH, window.innerWidth - 2 * TIP_MARGIN);
    const left = Math.max(TIP_MARGIN, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - TIP_MARGIN));
    const above = r.bottom + 180 > window.innerHeight && r.top > 200;
    setPos({ left, top: above ? r.top - 6 : r.bottom + 6, above });
  };
  // 離開後稍等一下再關，讓滑鼠可以移進說明框點連結
  const hide = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setPos(null), 150);
  };

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [pos]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  if (!source) return null;
  const kind = source.real ? "真實資料" : source.assumption ? "推估資料" : "模擬資料";
  return (
    <span className="source-tag" onMouseEnter={show} onMouseLeave={hide}>
      <span className={source.real ? "tag tag-real" : "tag tag-sim"}>{kind}</span>
      <button
        ref={anchor}
        type="button"
        className={source.real ? "source-info real" : "source-info sim"}
        aria-label={`${source.label}：${kind}說明`}
        aria-describedby={pos ? tipId : undefined}
        aria-expanded={pos !== null}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          // 在圖層清單裡，標籤包在 <label> 中，不能讓點「!」順便切換勾選
          e.preventDefault();
          e.stopPropagation();
          if (pos) setPos(null);
          else show();
        }}
      >
        !
      </button>
      {pos ? (
        <span
          id={tipId}
          role="tooltip"
          className="source-tip"
          style={{ left: pos.left, top: pos.top, width: Math.min(TIP_WIDTH, window.innerWidth - 2 * TIP_MARGIN), transform: pos.above ? "translateY(-100%)" : undefined }}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <strong className={source.real ? "source-tip-head real" : "source-tip-head sim"}>
            {source.label}・{source.real ? "資料來源" : source.assumption ? "推估方式" : "模擬方法"}
          </strong>
          <span className="source-tip-note">{source.note}</span>
          {source.links?.length ? (
            <span className="source-tip-links">
              {source.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" onFocus={show} onBlur={hide}>
                  {l.label} ↗
                </a>
              ))}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

const TIP_WIDTH = 300;
const TIP_MARGIN = 12;

/** 開關（使用／不使用某個參數） */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? "switch on" : "switch"} onClick={() => onChange(!on)}>
      <span className="switch-knob" />
    </button>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Swatch({ color, shape = "dot" }: { color: string; shape?: "dot" | "hex" }) {
  return <span className={`swatch swatch-${shape}`} style={{ background: color }} aria-hidden="true" />;
}

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Leaflet 的 tooltip 會把字串當 HTML，匯入的名稱要先跳脫 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** 依單位決定小數位數 */
export function fmtValue(v: number, unit = ""): string {
  if (unit.startsWith("%")) return fmt(v, 1);
  if (!Number.isInteger(v) && Math.abs(v) < 10) return fmt(v, 2);
  return fmt(v);
}
