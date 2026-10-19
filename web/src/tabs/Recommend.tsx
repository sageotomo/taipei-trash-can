import { useCallback, useMemo } from "react";
import type L from "leaflet";
import { FEATURES, DEFAULT_WEIGHTS, mainReason, type CellScore } from "../lib/score";
import { classOf, quantileBreaks } from "../lib/hex";
import { HexLayer, PointLayer, PANES } from "../map/layers";
import { placeNames } from "../lib/place";
import { Section, SourceTag, Swatch, fmt } from "../ui";
import type { AppData } from "../data";
import type { FeatureKey, GridCell, PoiKind, Weights } from "../types";

export const GAP_COLORS = ["#fbeccc", "#f6cf86", "#ee9f47", "#d4662a", "#9e3412"];

export type LayerKey = "bins" | PoiKind;
export type LayerVisibility = Record<LayerKey, boolean>;

export const DEFAULT_LAYERS: LayerVisibility = { bins: true, mrt: true, bus: false, youbike: false, shop: false };

const LAYER_INFO: { key: LayerKey; label: string; color: string; source: string }[] = [
  { key: "bins", label: "現有清潔箱", color: "#2e6b4f", source: "bins" },
  { key: "mrt", label: "捷運站", color: "#1d4e89", source: "mrt" },
  { key: "bus", label: "公車站", color: "#5f6f74", source: "bus" },
  { key: "youbike", label: "YouBike", color: "#e3b23c", source: "youbike" },
  { key: "shop", label: "飲料店、小吃店", color: "#c0577a", source: "shops" },
];

const POINT_STYLE: Record<LayerKey, L.CircleMarkerOptions> = {
  bins: { radius: 4, fillColor: "#2e6b4f", color: "#ffffff", weight: 1, fillOpacity: 1 },
  mrt: { radius: 6, fillColor: "#1d4e89", color: "#ffffff", weight: 1.5, fillOpacity: 1 },
  bus: { radius: 2.5, fillColor: "#5f6f74", color: "#5f6f74", weight: 0, fillOpacity: 0.7 },
  youbike: { radius: 3, fillColor: "#e3b23c", color: "#8a6a14", weight: 0.5, fillOpacity: 0.9 },
  shop: { radius: 2.5, fillColor: "#c0577a", color: "#c0577a", weight: 0, fillOpacity: 0.75 },
};

// ---------------- 地圖圖層 ----------------

interface LayersProps {
  data: AppData;
  scores: CellScore[];
  recommended: Set<number>;
  selected: number | null;
  onSelect: (index: number) => void;
  layers: LayerVisibility;
}

export function RecommendLayers({ data, scores, recommended, selected, onSelect, layers }: LayersProps) {
  const cells = useMemo(() => data.grid.map((c) => c.h3), [data.grid]);
  const breaks = useMemo(() => quantileBreaks(scores.map((s) => s.gap), GAP_COLORS.length), [scores]);

  const hexStyle = useCallback(
    (i: number): L.PathOptions => {
      const k = classOf(scores[i].gap, breaks);
      const isSelected = i === selected;
      const isRec = recommended.has(i);
      return {
        fillColor: k < 0 ? "#ffffff" : GAP_COLORS[k],
        fillOpacity: k < 0 ? 0.15 : 0.62,
        color: isSelected ? "#1b2a2f" : isRec ? "#5b1a08" : "#ffffff",
        weight: isSelected ? 3 : isRec ? 2 : 0.6,
        opacity: 1,
      };
    },
    [scores, breaks, selected, recommended]
  );

  const tooltip = useCallback(
    (i: number) => `${data.grid[i].district}・缺口第 ${scores[i].rank} 名`,
    [data.grid, scores]
  );

  return (
    <>
      <HexLayer cells={cells} style={hexStyle} onClick={onSelect} tooltip={tooltip} />
      <PoiLayers data={data} layers={layers} />
    </>
  );
}

/** 各種點位圖層，其他分頁也會用到 */
export function PoiLayers({ data, layers }: { data: AppData; layers: Partial<LayerVisibility> }) {
  const groups = useMemo(() => {
    const byKind: Record<PoiKind, { lat: number; lng: number; name?: string; flow?: number }[]> = {
      mrt: [], bus: [], youbike: [], shop: [],
    };
    for (const f of data.pois.features) {
      const [lng, lat] = f.geometry.coordinates;
      byKind[f.properties.kind].push({ lat, lng, name: f.properties.name, flow: f.properties.daily_flow });
    }
    return byKind;
  }, [data.pois]);

  const bins = useMemo(
    () => data.bins.features.map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] })),
    [data.bins]
  );

  const kinds: PoiKind[] = ["bus", "youbike", "shop", "mrt"];
  return (
    <>
      {kinds.map((k) =>
        layers[k] ? (
          <PointLayer
            key={k}
            points={groups[k]}
            style={STYLE_FN[k]}
            tooltip={k === "mrt" ? (i) => `${groups.mrt[i].name} 站・約 ${fmt(groups.mrt[i].flow ?? 0)} 人次/日` : undefined}
          />
        ) : null
      )}
      {layers.bins ? <PointLayer points={bins} style={STYLE_FN.bins} pane={PANES.top} /> : null}
    </>
  );
}

const STYLE_FN = Object.fromEntries(
  (Object.keys(POINT_STYLE) as LayerKey[]).map((k) => [k, () => POINT_STYLE[k]])
) as Record<LayerKey, () => L.CircleMarkerOptions>;

// ---------------- 側邊面板 ----------------

interface PanelProps {
  data: AppData;
  scores: CellScore[];
  recommendations: CellScore[];
  weights: Weights;
  onWeights: (w: Weights) => void;
  selected: number | null;
  onSelect: (index: number | null, fly?: boolean) => void;
  layers: LayerVisibility;
  onLayers: (l: LayerVisibility) => void;
  reportCounts: number[];
}

export function RecommendPanel(props: PanelProps) {
  const { data, scores, recommendations, selected, onSelect } = props;
  const source = (key: string) => data.sources.find((s) => s.key === key);
  const places = useMemo(() => placeNames(data), [data]);

  return (
    <>
      <p className="lead">
        顏色越深，代表人越多、垃圾桶越少。拖動權重看看不同的考量會讓建議點移到哪裡。
      </p>

      {selected !== null ? (
        <CellDetail
          cell={data.grid[selected]}
          place={places[selected]}
          score={scores[selected]}
          total={scores.length}
          isRecommended={recommendations.some((r) => r.index === selected)}
          reportCount={props.reportCounts[selected]}
          onClose={() => onSelect(null)}
        />
      ) : (
        <p className="hint-box">點地圖上任一格，看它的缺口排名和原因。</p>
      )}

      <WeightSliders weights={props.weights} onChange={props.onWeights} sources={data.sources} />

      <Section title={`建議增設前 ${recommendations.length} 名`}>
        <ol className="rank-list">
          {recommendations.map((r, i) => {
            const reason = FEATURES.find((f) => f.key === mainReason(r))!;
            return (
              <li key={r.h3}>
                <button
                  className={r.index === selected ? "rank-item active" : "rank-item"}
                  onClick={() => onSelect(r.index, true)}
                >
                  <span className="rank-no">{i + 1}</span>
                  <span className="rank-main">
                    {places[r.index]}
                    <small>主因：{reason.label}</small>
                  </span>
                  <span className="rank-score">附近 {data.grid[r.index].bins + data.grid[r.index].nbins} 桶</span>
                </button>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title="圖層">
        <ul className="layer-list">
          {LAYER_INFO.map((l) => (
            <li key={l.key}>
              <label>
                <input
                  type="checkbox"
                  checked={props.layers[l.key]}
                  onChange={(e) => props.onLayers({ ...props.layers, [l.key]: e.target.checked })}
                />
                <Swatch color={l.color} />
                {l.label}
                <SourceTag source={source(l.source)} />
              </label>
            </li>
          ))}
        </ul>
        <div className="legend">
          <span>缺口小</span>
          {GAP_COLORS.map((c) => (
            <Swatch key={c} color={c} shape="hex" />
          ))}
          <span>缺口大</span>
        </div>
      </Section>
    </>
  );
}

function WeightSliders({ weights, onChange, sources }: { weights: Weights; onChange: (w: Weights) => void; sources: AppData["sources"] }) {
  const sourceKey: Record<FeatureKey, string> = { mrt: "mrt", bus: "bus", youbike: "youbike", food: "shops", reports: "reports", fill: "fill" };
  const changed = FEATURES.some((f) => weights[f.key] !== DEFAULT_WEIGHTS[f.key]);
  return (
    <Section
      title="權重"
      aside={
        <button className="link-button" onClick={() => onChange(DEFAULT_WEIGHTS)} disabled={!changed}>
          重設
        </button>
      }
    >
      <div className="sliders">
        {FEATURES.map((f) => (
          <label key={f.key} className="slider">
            <span className="slider-label">
              {f.label}
              <SourceTag source={sources.find((s) => s.key === sourceKey[f.key])} />
            </span>
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.05}
              value={weights[f.key]}
              onChange={(e) => onChange({ ...weights, [f.key]: Number(e.target.value) })}
            />
            <output>{weights[f.key].toFixed(2)}</output>
          </label>
        ))}
      </div>
      <p className="footnote">公車站權重較高，依據是環保局過去的設置作業程序：清潔箱優先設在公車站牌多的地點。</p>
    </Section>
  );
}

const FEATURE_COLORS: Record<FeatureKey, string> = {
  mrt: "#1d4e89",
  bus: "#5f6f74",
  youbike: "#e3b23c",
  food: "#c0577a",
  reports: "#d1495b",
  fill: "#2e6b4f",
};

function rawText(key: FeatureKey, cell: GridCell, reports: number): string {
  switch (key) {
    case "mrt":
      return cell.mrt > 0 ? `約 ${fmt(cell.mrt)} 人次/日` : "500 m 內沒有捷運站";
    case "bus":
      return `附近 ${cell.bus} 站`;
    case "youbike":
      return `附近 ${cell.youbike} 站`;
    case "food":
      return `附近 ${cell.food} 家`;
    case "reports":
      return `本格 ${reports} 件`;
    case "fill":
      return cell.fill > 0 ? `每小時填 ${fmt(cell.fill * 100, 1)}%` : "附近沒有桶";
  }
}

function CellDetail({
  cell, place, score, total, isRecommended, reportCount, onClose,
}: {
  cell: GridCell;
  place: string;
  score: CellScore;
  total: number;
  isRecommended: boolean;
  reportCount: number;
  onClose: () => void;
}) {
  return (
    <div className="detail">
      <div className="detail-head">
        <div>
          <div className="detail-rank">
            第 {fmt(score.rank)} 名<small> / {fmt(total)} 格</small>
          </div>
          <div className="muted">
            {place}
            <br />
            {isRecommended ? "列入建議增設" : "未列入前 30 名"}
          </div>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="關閉">
          ×
        </button>
      </div>

      <div className="stack-bar" role="img" aria-label="需求來源比例">
        {FEATURES.map((f) =>
          score.contributions[f.key] > 0 ? (
            <span key={f.key} style={{ width: `${score.contributions[f.key] * 100}%`, background: FEATURE_COLORS[f.key] }} />
          ) : null
        )}
      </div>

      <table className="reason-table">
        <tbody>
          {FEATURES.map((f) => (
            <tr key={f.key}>
              <th>
                <Swatch color={FEATURE_COLORS[f.key]} />
                {f.label}
              </th>
              <td className="num">{fmt(score.contributions[f.key] * 100)}%</td>
              <td className="muted">{rawText(f.key, cell, reportCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="supply">
        <div>
          <dt>本格清潔箱</dt>
          <dd>{cell.bins} 個</dd>
        </div>
        <div>
          <dt>相鄰 6 格</dt>
          <dd>{cell.nbins} 個</dd>
        </div>
        <div>
          <dt>缺口分數</dt>
          <dd>{score.gap.toFixed(3)}</dd>
        </div>
      </dl>
    </div>
  );
}
