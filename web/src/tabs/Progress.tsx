import { useCallback, useMemo } from "react";
import type L from "leaflet";
import { HexLayer, PointLayer, PANES } from "../map/layers";
import { makePlacer } from "../lib/place";
import { Section, SourceTag, Swatch } from "../ui";
import type { AppData } from "../data";
import type { ProgressStatus } from "../types";

export const STATUS_ORDER: ProgressStatus[] = ["已設置", "施工中", "規劃中", "未處理"];
export const STATUS_COLORS: Record<ProgressStatus, string> = {
  已設置: "#2e6b4f",
  施工中: "#3d7fc1",
  規劃中: "#e3b23c",
  未處理: "#9aa5a8",
};

// ---------------- 地圖 ----------------

export function ProgressLayers({ data, district, selected, onSelect }: {
  data: AppData;
  district: string;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const items = data.progress;
  const cells = useMemo(() => items.map((p) => p.h3), [items]);

  const hexStyle = useCallback(
    (i: number): L.PathOptions => {
      const visible = district === "全部" || items[i].district === district;
      return {
        fillColor: STATUS_COLORS[items[i].status],
        fillOpacity: visible ? 0.35 : 0.05,
        color: i === selected ? "#1b2a2f" : STATUS_COLORS[items[i].status],
        weight: i === selected ? 3 : 1.5,
        opacity: visible ? 1 : 0.2,
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
        color: "#ffffff",
        weight: 2,
        opacity: visible ? 1 : 0.15,
      };
    },
    [items, district]
  );

  const tooltip = useCallback((i: number) => `#${items[i].rank}・${items[i].status}・${items[i].updated_at}`, [items]);

  const bins = useMemo(
    () => data.bins.features.map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] })),
    [data.bins]
  );
  const binStyle = useCallback(
    (): L.CircleMarkerOptions => ({ radius: 2.5, fillColor: "#5f6f74", color: "#5f6f74", weight: 0, fillOpacity: 0.45 }),
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

export function ProgressPanel({ data, district, onDistrict, selected, onSelect }: {
  data: AppData;
  district: string;
  onDistrict: (d: string) => void;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const items = data.progress;
  const place = useMemo(() => makePlacer(data), [data]);
  const districts = useMemo(() => ["全部", ...Array.from(new Set(items.map((p) => p.district))).sort()], [items]);

  const scope = district === "全部" ? items : items.filter((p) => p.district === district);
  const counts = STATUS_ORDER.map((s) => ({ status: s, n: scope.filter((p) => p.status === s).length }));
  const done = counts[0].n;

  return (
    <>
      <p className="lead">
        市府採納的 {items.length} 個建議增設點，目前做到哪裡？每個點都標出負責的清潔隊和最後更新日期
        <SourceTag source={data.sources.find((s) => s.key === "progress")} />。
      </p>

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
              district === "全部" || p.district === district ? (
                <tr key={p.h3} className={i === selected ? "active" : undefined}>
                  <td>
                    <button className="cell-button" onClick={() => onSelect(i)}>
                      {place([p.lat, p.lng], p.district)}
                    </button>
                    <small>{p.owner}</small>
                  </td>
                  <td>
                    <span className="status">
                      <Swatch color={STATUS_COLORS[p.status]} />
                      {p.status}
                    </span>
                  </td>
                  <td className="muted nowrap">{p.updated_at.slice(5).replace("-", "/")}</td>
                </tr>
              ) : null
            )}
          </tbody>
        </table>
      </Section>
    </>
  );
}
