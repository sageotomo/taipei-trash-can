import { useCallback, useMemo, useState } from "react";
import type L from "leaflet";
import { HexLayer, PointLayer, PANES } from "../map/layers";
import { makePlacer } from "../lib/place";
import { ACTIONS, CATEGORIES, HIGH_REPORTS, suggestAction, type Category } from "../lib/reports";
import { Section, SourceTag, Swatch, fmt } from "../ui";
import type { AppData } from "../data";
import type { Report } from "../types";

export const CATEGORY_COLORS: Record<string, string> = {
  亂丟垃圾: "#d1495b",
  清潔箱滿溢: "#e3b23c",
  家戶垃圾棄置: "#7b4fa0",
};

const HOT_COLORS = ["#f6d5d0", "#eda59b", "#d9614f", "#9e2a1d"];
function hotClass(count: number): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  if (count === 2) return 1;
  if (count < 5) return 2;
  return 3;
}

export interface Draft {
  lat: number;
  lng: number;
}

/** 每格的清潔箱數與「現行固定排程下一週平均滿溢小時數」 */
function useBinStats(data: AppData) {
  return useMemo(() => {
    const stats = new Map<string, { bins: number; overflowSum: number }>();
    data.bins.features.forEach((f, i) => {
      const s = stats.get(f.properties.h3) ?? { bins: 0, overflowSum: 0 };
      s.bins += 1;
      s.overflowSum += data.fill.overflow.A[i];
      stats.set(f.properties.h3, s);
    });
    return stats;
  }, [data]);
}

// ---------------- 地圖 ----------------

interface LayersProps {
  data: AppData;
  reports: Report[];
  reportCounts: number[];
  selected: number | null;
  draft: Draft | null;
}

export function ReportLayers({ data, reports, reportCounts, selected, draft }: LayersProps) {
  const cells = useMemo(() => data.grid.map((c) => c.h3), [data.grid]);

  const hexStyle = useCallback(
    (i: number): L.PathOptions => {
      const k = hotClass(reportCounts[i] ?? 0);
      const isSelected = i === selected;
      return {
        fillColor: k < 0 ? "#ffffff" : HOT_COLORS[k],
        fillOpacity: k < 0 ? 0.08 : 0.6,
        color: isSelected ? "#1b2a2f" : "#ffffff",
        weight: isSelected ? 3 : 0.5,
      };
    },
    [reportCounts, selected]
  );
  const tooltip = useCallback((i: number) => `通報 ${reportCounts[i] ?? 0} 件`, [reportCounts]);

  const bins = useMemo(
    () => data.bins.features.map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] })),
    [data.bins]
  );
  const binStyle = useCallback(
    (): L.CircleMarkerOptions => ({ radius: 3.5, fillColor: "#2e6b4f", color: "#ffffff", weight: 1, fillOpacity: 1 }),
    []
  );

  const reportStyle = useCallback(
    (i: number): L.CircleMarkerOptions => {
      const r = reports[i];
      return r.local
        ? { radius: 7, fillColor: CATEGORY_COLORS[r.category] ?? "#d1495b", color: "#1b2a2f", weight: 2, fillOpacity: 1 }
        : { radius: 3.5, fillColor: CATEGORY_COLORS[r.category] ?? "#d1495b", color: "#ffffff", weight: 0.8, fillOpacity: 0.9 };
    },
    [reports]
  );
  const reportTip = useCallback(
    (i: number) => {
      const r = reports[i];
      return `${r.category}・${r.created_at}${r.note ? `<br>${escapeHtml(r.note)}` : ""}`;
    },
    [reports]
  );

  const draftPoints = useMemo(() => (draft ? [draft] : []), [draft]);
  const draftStyle = useCallback(
    (): L.CircleMarkerOptions => ({ radius: 10, fillColor: "#ffffff", color: "#1b2a2f", weight: 3, fillOpacity: 0.9, dashArray: "3 3" }),
    []
  );

  return (
    <>
      <HexLayer cells={cells} style={hexStyle} tooltip={tooltip} />
      <PointLayer points={bins} style={binStyle} />
      <PointLayer points={reports} style={reportStyle} tooltip={reportTip} pane={PANES.top} />
      <PointLayer points={draftPoints} style={draftStyle} pane={PANES.top} />
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// ---------------- 面板 ----------------

interface PanelProps {
  data: AppData;
  reports: Report[];
  localReports: Report[];
  reportCounts: number[];
  selected: number | null;
  draft: Draft | null;
  onSubmit: (category: Category, note: string) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onFocus: (lat: number, lng: number) => void;
}

export function ReportPanel(props: PanelProps) {
  const { data, reports, localReports, reportCounts, selected, draft } = props;
  const [category, setCategory] = useState<Category>("亂丟垃圾");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const binStats = useBinStats(data);
  const place = useMemo(() => makePlacer(data), [data]);

  const byCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reports) counts[r.category] = (counts[r.category] ?? 0) + 1;
    return counts;
  }, [reports]);

  const cell = selected !== null ? data.grid[selected] : null;
  const advice = useMemo(() => {
    if (!cell || selected === null) return null;
    const s = binStats.get(cell.h3);
    const bins = s?.bins ?? 0;
    const avgOverflow = s && s.bins > 0 ? s.overflowSum / s.bins : 0;
    const count = reportCounts[selected] ?? 0;
    return { count, bins, avgOverflow, action: suggestAction(count, bins, avgOverflow) };
  }, [cell, selected, binStats, reportCounts]);

  const submit = () => {
    props.onSubmit(category, note);
    setNote("");
    setSent(true);
  };

  return (
    <>
      <p className="lead">
        點地圖上你看到垃圾問題的位置，選類別後送出。不用登入、不收個資，通報只存在這台裝置的瀏覽器。
      </p>

      {draft ? (
        <div className="detail">
          <div className="detail-head">
            <div>
              <div className="form-title">新增通報</div>
              <div className="muted">{place([draft.lat, draft.lng], cell?.district ?? "研究範圍外")}</div>
            </div>
            <button className="icon-button" onClick={props.onCancel} aria-label="取消">
              ×
            </button>
          </div>
          <fieldset className="chips">
            <legend className="sr-only">類別</legend>
            {CATEGORIES.map((c) => (
              <label key={c} className={category === c ? "chip active" : "chip"}>
                <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} />
                <Swatch color={CATEGORY_COLORS[c]} />
                {c}
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>說明（選填）</span>
            <textarea
              rows={3}
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：公車站旁常有人丟飲料杯"
            />
          </label>
          <div className="form-actions">
            <button className="button" onClick={props.onCancel}>
              取消
            </button>
            <button className="button primary" onClick={submit}>
              送出通報
            </button>
          </div>
        </div>
      ) : (
        <p className="hint-box">{sent ? "已送出通報。地圖上有黑框的點就是你的通報。" : "點地圖選一個位置開始通報。"}</p>
      )}

      {cell && advice ? (
        <div className={`advice advice-${advice.action}`}>
          <div className="advice-label">這一格的處置建議</div>
          <div className="advice-action">{ACTIONS[advice.action].label}</div>
          <p>{ACTIONS[advice.action].why}</p>
          <dl className="supply">
            <div>
              <dt>通報</dt>
              <dd>{advice.count} 件</dd>
            </div>
            <div>
              <dt>清潔箱</dt>
              <dd>{advice.bins} 個</dd>
            </div>
            <div>
              <dt>每桶一週滿溢</dt>
              <dd>{advice.bins > 0 ? `${fmt(advice.avgOverflow, 1)} 小時` : "—"}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <Section title="通報統計" aside={<SourceTag source={data.sources.find((s) => s.key === "reports")} />}>
        <ul className="layer-list">
          {CATEGORIES.map((c) => (
            <li key={c} className="stat-row">
              <span>
                <Swatch color={CATEGORY_COLORS[c]} />
                {c}
              </span>
              <span className="num">{fmt(byCategory[c] ?? 0)} 件</span>
            </li>
          ))}
        </ul>
        <div className="legend">
          <span>通報少</span>
          {HOT_COLORS.map((c) => (
            <Swatch key={c} color={c} shape="hex" />
          ))}
          <span>多（{HIGH_REPORTS} 件以上算高）</span>
        </div>
      </Section>

      <Section
        title={`你送出的通報（${localReports.length}）`}
        aside={
          localReports.length > 0 ? (
            <button className="link-button" onClick={props.onClear}>
              全部清除
            </button>
          ) : null
        }
      >
        {localReports.length === 0 ? (
          <p className="muted">還沒有。</p>
        ) : (
          <ul className="rank-list">
            {[...localReports].reverse().map((r) => (
              <li key={r.id} className="report-row">
                <button className="rank-item" onClick={() => props.onFocus(r.lat, r.lng)}>
                  <Swatch color={CATEGORY_COLORS[r.category]} />
                  <span className="rank-main">
                    {r.category}
                    <small>{r.note || r.created_at}</small>
                  </span>
                </button>
                <button className="link-button" onClick={() => props.onDelete(r.id)} aria-label={`刪除這筆${r.category}通報`}>
                  刪除
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
