import type { ReactNode } from "react";
import type { Source } from "./types";

/** 每個資料都標示真實或模擬，這是黑客松規則要求的 */
export function SourceTag({ source }: { source?: Source }) {
  if (!source) return null;
  return (
    <span className={source.real ? "tag tag-real" : "tag tag-sim"} title={source.note}>
      {source.real ? "真實" : "模擬"}
    </span>
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
