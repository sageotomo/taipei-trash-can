import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type L from "leaflet";
import {
  DEFAULT_INDICATORS,
  LEVELS,
  indicatorUnit,
  levelOf,
  mainReason,
  methodText,
  type CellResult,
  type DataLayer,
  type Indicator,
  type IndexResult,
} from "../lib/indicators";
import { cellCenter } from "../lib/hexgrid";
import { HexLayer, PANES } from "../map/layers";
import { POI_TYPES, PoiIcon, PoiPointLayer, type LabeledPoint } from "../map/icons";
import type { Placer } from "../lib/place";
import { Section, SourceTag, Swatch, escapeHtml, fmt, fmtValue } from "../ui";
import type { AppData } from "../data";

export type Visibility = Record<string, boolean>;
export const DEFAULT_VISIBILITY: Visibility = { bins: true, mrt: true };

const PLUS = "#2e6b4f";
const MINUS = "#b23a48";

// ---------------- 地圖圖層 ----------------

interface LayersProps {
  data: AppData;
  layers: DataLayer[];
  cells: string[];
  result: IndexResult;
  recommended: Set<string>;
  selected: string | null;
  onSelect: (cell: string) => void;
  visible: Visibility;
  place: Placer;
}

export function RecommendLayers({ data, layers, cells, result, recommended, selected, onSelect, visible, place }: LayersProps) {
  const hexStyle = useCallback(
    (i: number): L.PathOptions => {
      const r = result.cells[i];
      const k = levelOf(r.value, result.maxPossible);
      const isSelected = r.cell === selected;
      const isRec = recommended.has(r.cell);
      return {
        fillColor: k < 0 ? "#ffffff" : LEVELS[k].color,
        fillOpacity: k < 0 ? 0.04 : 0.42,
        color: isSelected ? "#1b2a2f" : isRec ? "#5b1a08" : "#ffffff",
        weight: isSelected ? 3 : isRec ? 2 : 0.5,
        opacity: isSelected || isRec ? 1 : 0.5,
      };
    },
    [result, selected, recommended]
  );

  const tooltip = useCallback(
    (i: number) => {
      const r = result.cells[i];
      const k = levelOf(r.value, result.maxPossible);
      const d = place.district(cellCenter(r.cell));
      return k < 0 ? `${d}・不缺（缺桶指數 0）` : `${d}・缺桶指數 ${r.value.toFixed(2)}（${LEVELS[k].label}）`;
    },
    [result, place]
  );

  const onClick = useCallback((i: number) => onSelect(cells[i]), [cells, onSelect]);

  return (
    <>
      <HexLayer cells={cells} style={hexStyle} onClick={onClick} tooltip={tooltip} />
      <PoiLayers data={data} layers={layers} visible={visible} />
    </>
  );
}

const ICON_ZOOM: Record<string, number> = { mrt: 13, bins: 15, bus: 16, youbike: 16, reports: 16 };

function pointLabel(layer: DataLayer, p: DataLayer["points"][number], simulated: boolean, title = layer.label): string {
  const head = p.name ? `${escapeHtml(title)}：${escapeHtml(p.name)}` : escapeHtml(title);
  const extra = layer.fields
    .filter((f) => p.values?.[f.key] !== undefined)
    .map((f) => escapeHtml(`${f.label} ${fmtValue(p.values![f.key], f.unit)} ${f.unit}`))
    .join("・");
  return head + (extra ? `<br>${extra}` : "") + (simulated ? "（模擬）" : "");
}

/** 各圖層的點，其他分頁也會用到。縮小時是圓點，放大後換成圖示 */
export function PoiLayers({ data, layers, visible }: { data: AppData; layers: DataLayer[]; visible: Visibility }) {
  const groups = useMemo(() => {
    const sim = (layer: DataLayer) => data.sources.find((s) => s.key === layer.source)?.real === false;
    return layers.flatMap((layer) => {
      if (layer.id === "shops") {
        // 店家分成飲料店、餐飲店兩種圖示
        return (["drink", "food"] as const).map((t) => ({
          key: `shops-${t}`, layer, icon: POI_TYPES[t], label: POI_TYPES[t].label,
          points: layer.points
            .filter((p) => p.tag === t)
            .map((p): LabeledPoint => ({ lat: p.lat, lng: p.lng, label: pointLabel(layer, p, sim(layer), POI_TYPES[t].label) })),
        }));
      }
      return [{
        key: layer.id, layer, icon: layer.icon, label: layer.label,
        points: layer.points.map((p): LabeledPoint => ({ lat: p.lat, lng: p.lng, label: pointLabel(layer, p, sim(layer)) })),
      }];
    });
  }, [data.sources, layers]);

  // 捷運、清潔箱畫在最上面
  const order = (id: string) => (id === "mrt" ? 2 : id === "bins" ? 1 : 0);
  return (
    <>
      {[...groups]
        .sort((a, b) => order(a.layer.id) - order(b.layer.id))
        .map((g) =>
          visible[g.layer.id] ? (
            <PoiPointLayer
              key={g.key}
              icon={g.icon}
              label={g.label}
              points={g.points}
              iconZoom={g.key === "shops-food" ? 17 : (ICON_ZOOM[g.layer.id] ?? 15)}
              pane={order(g.layer.id) > 0 ? PANES.top : PANES.points}
              radius={g.layer.id === "mrt" ? 7 : g.layer.id === "bins" ? 4.5 : 3.5}
              zIndexOffset={order(g.layer.id) * 500}
            />
          ) : null
        )}
    </>
  );
}

// ---------------- 側邊面板 ----------------

interface PanelProps {
  data: AppData;
  layers: DataLayer[];
  indicators: Indicator[];
  onIndicators: (list: Indicator[]) => void;
  result: IndexResult;
  recommendations: CellResult[];
  selected: string | null;
  onSelect: (cell: string | null, fly?: boolean) => void;
  visible: Visibility;
  onVisible: (v: Visibility) => void;
  place: Placer;
  /** 地圖圖層清單下方的額外內容（匯入資料） */
  layerTools?: ReactNode;
}

export function RecommendPanel(props: PanelProps) {
  const { data, layers, indicators, result, recommendations, selected, onSelect, place } = props;
  const layerOf = (id: string) => layers.find((l) => l.id === id);
  const selectedResult = selected ? result.byCell.get(selected) : undefined;
  const detailRef = useRef<HTMLDivElement>(null);

  // 從清單或地圖選了一格，就把明細捲到看得到的地方
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <>
      <p className="lead">
        每一格只看格內的資料：人潮、店家越多越需要垃圾桶，已經有桶的地方就扣分。調整下面的指標，看看建議點怎麼移動。
      </p>

      <Formula indicators={indicators} />

      <div ref={detailRef} className="detail-anchor">
        {selected && selectedResult ? (
          <CellDetail
            result={result}
            r={selectedResult}
            indicators={indicators}
            layerOf={layerOf}
            place={place(cellCenter(selected))}
            isRecommended={recommendations.some((x) => x.cell === selected)}
            onClose={() => onSelect(null)}
          />
        ) : (
          <p className="hint-box">點地圖上任一格，看它的缺桶指數怎麼算出來的。</p>
        )}
      </div>

      <IndicatorEditor indicators={indicators} onChange={props.onIndicators} result={result} layers={layers} sources={data.sources} />

      <Section title={`建議增設前 ${recommendations.length} 名`}>
        {recommendations.length === 0 ? (
          <p className="hint-box">目前的設定下，每一格的缺桶指數都是 0。調高「需要桶」指標的權重，就會出現建議點。</p>
        ) : null}
        <ol className="rank-list">
          {recommendations.map((r, i) => {
            const k = mainReason(r);
            return (
              <li key={r.cell}>
                <button className={r.cell === selected ? "rank-item active" : "rank-item"} onClick={() => onSelect(r.cell, true)}>
                  <span className="rank-no">{i + 1}</span>
                  <span className="rank-main">
                    {place(cellCenter(r.cell))}
                    {k >= 0 ? <small>主因：{indicators[k].label}</small> : null}
                  </span>
                  <span className="rank-score">{r.value.toFixed(2)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title="地圖圖層">
        <ul className="layer-list">
          {layers.map((l) => (
            <li key={l.id}>
              <label>
                <input
                  type="checkbox"
                  checked={!!props.visible[l.id]}
                  onChange={(e) => props.onVisible({ ...props.visible, [l.id]: e.target.checked })}
                />
                <span className="layer-icons">
                  {l.id === "shops" ? (
                    <>
                      <PoiIcon icon={POI_TYPES.drink} />
                      <PoiIcon icon={POI_TYPES.food} />
                    </>
                  ) : (
                    <PoiIcon icon={l.icon} />
                  )}
                </span>
                <span className="layer-name">
                  {l.label}
                  <small>{fmt(l.points.length)}</small>
                </span>
                {l.custom ? <span className="tag tag-import">匯入</span> : <SourceTag source={data.sources.find((s) => s.key === l.source)} />}
              </label>
            </li>
          ))}
        </ul>
        {props.layerTools}
        <p className="footnote">放大地圖，圓點會換成圖示；滑鼠移到點上可以看名稱。</p>
        <div className="legend">
          <span className="legend-item">
            <Swatch color="#ffffff" shape="hex" />
            不缺
          </span>
          {LEVELS.map((l) => (
            <span key={l.label} className="legend-item">
              <Swatch color={l.color} shape="hex" />
              {l.label}
            </span>
          ))}
        </div>
      </Section>
    </>
  );
}

// ---------------- 公式 ----------------

function Formula({ indicators }: { indicators: Indicator[] }) {
  const active = [...indicators.filter((i) => i.weight > 0 && i.sign > 0), ...indicators.filter((i) => i.weight > 0 && i.sign < 0)];
  return (
    <div className="formula" aria-live="polite">
      <div className="formula-title">缺桶指數 ＝</div>
      <div className="formula-body">
        {active.length === 0 ? <span className="muted">（所有權重都是 0）</span> : null}
        {active.map((ind, j) => (
          <span key={ind.id} className={ind.sign > 0 ? "term plus" : "term minus"}>
            {ind.sign < 0 ? "− " : j > 0 ? "+ " : ""}
            {ind.weight.toFixed(2)} × {ind.label}
          </span>
        ))}
      </div>
      <p className="footnote">每一項的分數 ＝ 格內數值 ÷ 上限，超過上限算 1。只看格內的資料；結果低於 0 算 0。</p>
    </div>
  );
}

// ---------------- 格子明細 ----------------

function CellDetail({ result, r, indicators, layerOf, place, isRecommended, onClose }: {
  result: IndexResult;
  r: CellResult;
  indicators: Indicator[];
  layerOf: (id: string) => DataLayer | undefined;
  place: string;
  isRecommended: boolean;
  onClose: () => void;
}) {
  const k = levelOf(r.value, result.maxPossible);
  const sum = r.term.reduce((a, b) => a + b, 0);
  const rows = indicators.map((ind, j) => ({ ind, j })).filter(({ ind }) => ind.weight > 0);

  return (
    <div className="detail">
      <div className="detail-head">
        <div>
          <div className="detail-rank">
            {k >= 0 ? (
              <>
                缺桶指數 {r.value.toFixed(2)}
                <small>（{LEVELS[k].label}）</small>
              </>
            ) : (
              "不缺"
            )}
          </div>
          <div className="muted">
            {place}
            <br />
            {k >= 0 ? `全台北第 ${fmt(r.rank)} 名 / ${fmt(result.ranked)} 格` : "缺桶指數 0"}
            {isRecommended ? "・列入建議增設" : ""}
          </div>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="關閉">
          ×
        </button>
      </div>

      <table className="calc-table">
        <tbody>
          {rows.map(({ ind, j }) => {
            const layer = layerOf(ind.layer);
            const unit = indicatorUnit(ind, layer);
            const cap = result.stats[j].cap;
            const raw = r.raw[j];
            return (
              <tr key={ind.id}>
                <th>
                  <Swatch color={ind.sign > 0 ? PLUS : MINUS} />
                  {ind.label}
                </th>
                <td className="calc">
                  {raw === 0 ? (
                    <span className="muted">格內沒有</span>
                  ) : (
                    <>
                      {fmtValue(raw, unit)} {unit} ÷ {fmtValue(cap, unit)}
                      {raw >= cap ? " → 滿分 1" : ` = ${r.score[j].toFixed(2)}`}
                      <span className="muted"> × {ind.weight.toFixed(2)}</span>
                    </>
                  )}
                </td>
                <td className={r.term[j] > 0 ? "num plus" : r.term[j] < 0 ? "num minus" : "num muted"}>
                  {r.term[j] > 0 ? "+" : r.term[j] < 0 ? "−" : ""}
                  {Math.abs(r.term[j]).toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th>缺桶指數</th>
            <td className="calc muted">{sum < 0 ? `合計 −${Math.abs(sum).toFixed(2)}，低於 0 算 0` : "合計"}</td>
            <td className="num">{r.value.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---------------- 指標設定 ----------------

function IndicatorEditor({ indicators, onChange, result, layers, sources }: {
  indicators: Indicator[];
  onChange: (list: Indicator[]) => void;
  result: IndexResult;
  layers: DataLayer[];
  sources: AppData["sources"];
}) {
  const [adding, setAdding] = useState(false);
  const isDefault = JSON.stringify(indicators) === JSON.stringify(DEFAULT_INDICATORS);
  const update = (k: number, patch: Partial<Indicator>) => onChange(indicators.map((x, i) => (i === k ? { ...x, ...patch } : x)));

  return (
    <Section
      title="指標與權重"
      aside={
        <button className="link-button" onClick={() => onChange(DEFAULT_INDICATORS)} disabled={isDefault}>
          恢復預設
        </button>
      }
    >
      <ul className="ind-list">
        {indicators.map((ind, k) => (
          <IndicatorCard
            key={ind.id}
            ind={ind}
            stat={result.stats[k]}
            layer={layers.find((l) => l.id === ind.layer)}
            sources={sources}
            onChange={(patch) => update(k, patch)}
            onRemove={() => onChange(indicators.filter((_, i) => i !== k))}
          />
        ))}
      </ul>
      {adding ? (
        <AddIndicator
          layers={layers}
          onAdd={(ind) => {
            onChange([...indicators, ind]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button className="button add-button" onClick={() => setAdding(true)}>
          ＋ 新增指標
        </button>
      )}
      <p className="footnote">公車站權重較高，依據是環保局過去的設置作業程序：清潔箱優先設在公車站牌多的地點。</p>
    </Section>
  );
}

function SignToggle({ sign, onChange }: { sign: 1 | -1; onChange: (s: 1 | -1) => void }) {
  return (
    <div className="sign-toggle" role="group" aria-label="方向">
      <button className={sign > 0 ? "on plus" : ""} aria-pressed={sign > 0} onClick={() => onChange(1)}>
        ＋ 需要桶
      </button>
      <button className={sign < 0 ? "on minus" : ""} aria-pressed={sign < 0} onClick={() => onChange(-1)}>
        − 不缺桶
      </button>
    </div>
  );
}

function MethodSelect({ layer, value, onChange }: { layer: DataLayer; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="count">格內有幾{layer.unit}</option>
      {layer.fields.map((f) => (
        <option key={f.key} value={`sum:${f.key}`}>
          格內「{f.label}」加總
        </option>
      ))}
    </select>
  );
}

function IndicatorCard({ ind, stat, layer, sources, onChange, onRemove }: {
  ind: Indicator;
  stat: IndexResult["stats"][number];
  layer?: DataLayer;
  sources: AppData["sources"];
  onChange: (patch: Partial<Indicator>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const unit = indicatorUnit(ind, layer);

  return (
    <li className={ind.weight > 0 ? "ind-card" : "ind-card off"}>
      <div className="ind-head">
        {layer ? <PoiIcon icon={layer.icon} size={18} /> : null}
        <span className="ind-label">
          {ind.label}
          {layer?.custom ? <span className="tag tag-import">匯入</span> : <SourceTag source={sources.find((s) => s.key === layer?.source)} />}
        </span>
        <SignToggle sign={ind.sign} onChange={(sign) => onChange({ sign })} />
      </div>
      <label className="ind-weight">
        <span className="sr-only">{ind.label}的權重</span>
        <input type="range" min={0} max={0.5} step={0.05} value={ind.weight} onChange={(e) => onChange({ weight: Number(e.target.value) })} />
        <output className={ind.sign > 0 ? "plus" : "minus"}>
          {ind.sign > 0 ? "+" : "−"}
          {ind.weight.toFixed(2)}
        </output>
      </label>
      <div className="ind-meta">
        <span>
          {methodText(ind, layer)}・上限 {fmtValue(stat.cap, unit)} {unit}
          {stat.auto ? "（自動）" : ""}・{fmt(stat.fullShare * 100)}% 有資料的格子拿滿分
        </span>
        <button className="link-button" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "收起" : "設定"}
        </button>
      </div>
      {open ? (
        <div className="ind-settings">
          {layer ? (
            <>
              <label className="field-inline">
                <span>怎麼算</span>
                <MethodSelect
                  layer={layer}
                  value={ind.method === "count" ? "count" : `sum:${ind.field}`}
                  onChange={(v) =>
                    onChange(v === "count" ? { method: "count", field: undefined, cap: null } : { method: "sum", field: v.slice(4), cap: null })
                  }
                />
              </label>
              <label className="field-inline">
                <span>上限</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  placeholder={`自動：${fmtValue(stat.cap, unit)}`}
                  value={ind.cap ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    onChange({ cap: e.target.value === "" || !(v > 0) ? null : v });
                  }}
                />
                <span className="muted">{unit}</span>
              </label>
              <p className="footnote">上限留白＝自動：有資料的格子中第 90 百分位的數值。格內數值超過上限就算滿分 1。</p>
            </>
          ) : null}
          <button className="link-button danger" onClick={onRemove}>
            刪除這個指標
          </button>
        </div>
      ) : null}
    </li>
  );
}

function AddIndicator({ layers, onAdd, onCancel }: { layers: DataLayer[]; onAdd: (ind: Indicator) => void; onCancel: () => void }) {
  const [layerId, setLayerId] = useState(layers[0]?.id ?? "");
  const [method, setMethod] = useState("count");
  const [sign, setSign] = useState<1 | -1>(1);
  const layer = layers.find((l) => l.id === layerId);

  const add = () => {
    if (!layer) return;
    const field = method.startsWith("sum:") ? method.slice(4) : undefined;
    const fieldLabel = layer.fields.find((f) => f.key === field)?.label;
    onAdd({
      id: `c${Date.now().toString(36)}`,
      label: fieldLabel ? `${layer.label}${fieldLabel}` : layer.label,
      layer: layer.id,
      method: field ? "sum" : "count",
      field,
      sign,
      weight: 0.1,
      cap: null,
    });
  };

  return (
    <div className="detail add-form">
      <div className="form-title">新增指標</div>
      <label className="field-inline">
        <span>圖層</span>
        <select
          value={layerId}
          onChange={(e) => {
            setLayerId(e.target.value);
            setMethod("count");
          }}
        >
          {layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      {layer ? (
        <label className="field-inline">
          <span>怎麼算</span>
          <MethodSelect layer={layer} value={method} onChange={setMethod} />
        </label>
      ) : null}
      <div className="field-inline">
        <span>方向</span>
        <SignToggle sign={sign} onChange={setSign} />
      </div>
      <div className="form-actions">
        <button className="button" onClick={onCancel}>
          取消
        </button>
        <button className="button primary" onClick={add} disabled={!layer}>
          新增
        </button>
      </div>
    </div>
  );
}
