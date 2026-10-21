import { useCallback, useMemo } from "react";
import type L from "leaflet";
import { HexLayer, PointLayer, PANES } from "../map/layers";
import type { Placer } from "../lib/place";
import { Section, SourceTag, Swatch } from "../ui";
import type { AppData } from "../data";
import type { ProgressItem, ProgressStatus } from "../types";
import { WEEKS, shortDate, type ProgressSnapshot } from "../lib/progress";
import { MAP } from "../lib/theme";

export const STATUS_ORDER: ProgressStatus[] = ["已設置", "施工中", "規劃中", "未處理"];
export const STATUS_COLORS: Record<ProgressStatus, string> = {
  已設置: "#4caf7d",
  施工中: "#4f93d6",
  規劃中: "#e3b23c",
  未處理: "#7d9095",
};

// ---------------- 地圖 ----------------

export function ProgressLayers({ data, items, district, selected, onSelect }: {
  data: AppData;
  items: ProgressItem[];
  district: string;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const cells = useMemo(() => items.map((p) => p.cell), [items]);

  const hexStyle = useCallback(
    (i: number): L.PathOptions => {
      const visible = district === "全部" || items[i].district === district;
      const outside = items[i].rank === null;
      return {
        fillColor: STATUS_COLORS[items[i].status],
        fillOpacity: visible ? (outside ? 0.1 : 0.25) : 0.04,
        color: i === selected ? MAP.selected : STATUS_COLORS[items[i].status],
        weight: i === selected ? 3 : 1.5,
        opacity: visible ? 1 : 0.2,
        dashArray: outside && i !== selected ? "4 4" : undefined,
      };
    },
    [items, district, selected]
  );

  const pointStyle = useCallback(
    (i: number): L.CircleMarkerOptions => {
      const visible = district === "全部" || items[i].district === district;
      return {
        radius: 8,
        fillColor: STATUS_COLORS[items[i].status],
        fillOpacity: visible ? 1 : 0.15,
        color: MAP.outline,
        weight: 2,
        opacity: visible ? 1 : 0.15,
      };
    },
    [items, district]
  );

  const tooltip = useCallback(
    (i: number) => {
      const p = items[i];
      return `${p.rank === null ? "已不在前 30 名" : `第 ${p.rank} 名`}・${p.status}・${shortDate(p.updated_at)} 更新`;
    },
    [items]
  );

  const bins = useMemo(
    () => data.bins.features.map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] })),
    [data.bins]
  );
  const binStyle = useCallback(
    (): L.CircleMarkerOptions => ({ radius: 2.5, fillColor: MAP.dim, color: MAP.dim, weight: 0, fillOpacity: 0.45 }),
    []
  );

  return (
    <>
      <PointLayer points={bins} style={binStyle} />
      <HexLayer cells={cells} style={hexStyle} onClick={onSelect} tooltip={tooltip} />
      <PointLayer points={items} style={pointStyle} pane={PANES.top} onClick={onSelect} tooltip={tooltip} />
    </>
  );
}

// ---------------- 面板 ----------------

function weekLabel(w: number): string {
  const week = WEEKS[w];
  const latest = w === WEEKS.length - 1 ? "（最新）" : "";
  return `${shortDate(week.start)}–${shortDate(week.end)} 這週${latest}`;
}

export function ProgressPanel({ data, history, week, onWeek, place, district, onDistrict, selected, onSelect }: {
  data: AppData;
  history: ProgressSnapshot[];
  week: number;
  onWeek: (w: number) => void;
  place: Placer;
  district: string;
  onDistrict: (d: string) => void;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const snap = history[week];
  const items = snap?.items ?? [];
  const districts = useMemo(
    () => ["全部", ...Array.from(new Set(history.flatMap((s) => s.items.map((p) => p.district)))).sort()],
    [history]
  );
  const inDistrict = (p: ProgressItem) => district === "全部" || p.district === district;

  const scope = items.filter(inDistrict);
  const counts = STATUS_ORDER.map((s) => ({ status: s, n: scope.filter((p) => p.status === s).length }));
  const done = counts[0].n;
  const added = (snap?.added ?? []).filter(inDistrict);
  const removed = (snap?.removed ?? []).filter(inDistrict);
  const outside = scope.filter((p) => p.rank === null).length;
  const advancedSet = new Set(snap?.advanced ?? []);
  const advanced = scope.filter((p) => advancedSet.has(p.cell)).length;

  if (!snap) return null;

  return (
    <>
      <p className="lead">
        市府每週一用最新的通報重新算一次建議增設的前 30 名，並追蹤每個點做到哪裡。選一週看當時的狀況
        <SourceTag source={data.sources.find((s) => s.key === "progress")} />。
      </p>

      <div className="week-picker">
        <label className="select">
          <span className="week-picker-label">週次</span>
          <select value={week} onChange={(e) => onWeek(Number(e.target.value))}>
            {[...WEEKS.keys()].reverse().map((w) => (
              <option key={w} value={w}>
                {weekLabel(w)}
              </option>
            ))}
          </select>
        </label>
        <div className="week-steps" role="group" aria-label="上一週或下一週">
          <button className="button" disabled={week === 0} onClick={() => onWeek(week - 1)} aria-label="上一週">
            ‹ 上一週
          </button>
          <button className="button" disabled={week === WEEKS.length - 1} onClick={() => onWeek(week + 1)} aria-label="下一週">
            下一週 ›
          </button>
        </div>
      </div>

      <div className="progress-head">
        <div className="progress-number">
          已設置 {done}
          <small> / {scope.length}</small>
        </div>
        <label className="select">
          <span className="sr-only">行政區</span>
          <select value={district} onChange={(e) => onDistrict(e.target.value)}>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d === "全部" ? "全部行政區" : d}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="stack-bar progress-bar" role="img" aria-label={`已設置 ${done} 個，共 ${scope.length} 個`}>
        {counts.map(({ status, n }) =>
          n > 0 ? <span key={status} style={{ width: `${(n / scope.length) * 100}%`, background: STATUS_COLORS[status] }} /> : null
        )}
      </div>
      <div className="legend">
        {counts.map(({ status, n }) => (
          <span key={status} className="legend-item">
            <Swatch color={STATUS_COLORS[status]} />
            {status} {n}
          </span>
        ))}
      </div>

      <Section title="這週的變化">
        {week === 0 ? (
          <p className="muted">這是第一週的紀錄，開始追蹤前 30 名。</p>
        ) : (
          <>
            <dl className="supply week-changes">
              <div>
                <dt>新進前 30 名</dt>
                <dd>{added.length} 點</dd>
              </div>
              <div>
                <dt>移出清單</dt>
                <dd>{removed.length} 點</dd>
              </div>
              <div>
                <dt>狀態往前推</dt>
                <dd>{advanced} 點</dd>
              </div>
            </dl>
            {removed.length > 0 ? (
              <p className="footnote">
                移出：{removed.map((p) => place([p.lat, p.lng], p.district)).join("、")}。這些點掉出前 30 名，當時還沒動工，所以不再追蹤。
              </p>
            ) : null}
          </>
        )}
        {outside > 0 ? (
          <p className="footnote">清單最後 {outside} 點已經不在前 30 名，但已經動工，會繼續做完（地圖上用虛線框標示）。</p>
        ) : null}
      </Section>

      <Section title="建議點">
        <table className="progress-table">
          <thead>
            <tr>
              <th>位置</th>
              <th>狀態</th>
              <th>更新</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p, i) =>
              inDistrict(p) ? (
                <tr key={p.cell} className={[i === selected ? "active" : "", p.rank === null ? "outside" : ""].filter(Boolean).join(" ") || undefined}>
                  <td>
                    <button className="cell-button" onClick={() => onSelect(i)}>
                      {place([p.lat, p.lng], p.district)}
                    </button>
                    <small>
                      {p.rank === null ? "已不在前 30 名" : `第 ${p.rank} 名`}・{p.owner}
                      {week > 0 && p.since === snap.week.start ? <span className="new-tag">本週新進</span> : null}
                    </small>
                  </td>
                  <td>
                    <span className="status">
                      <Swatch color={STATUS_COLORS[p.status]} />
                      {p.status}
                    </span>
                  </td>
                  <td className="muted nowrap">{shortDate(p.updated_at)}</td>
                </tr>
              ) : null
            )}
          </tbody>
        </table>
      </Section>
    </>
  );
}
