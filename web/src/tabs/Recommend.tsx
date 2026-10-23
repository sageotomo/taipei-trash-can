import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type L from "leaflet";
import {
  DEFAULT_INDICATORS,
  LEVELS,
  freeMethods,
  methodKey,
  usedMethods,
  indicatorUnit,
  isOn,
  levelOf,
  curveOf,
  mainReason,
  methodText,
  indicatorSource,
  type CellResult,
  type DataLayer,
  type Indicator,
  type IndexResult,
} from "../lib/indicators";
import { cellCenter, latLngToCell } from "../lib/hexgrid";
import { HexLayer, MapClick } from "../map/layers";
import { PoiLayer, PoiIcon, type LabeledPoint } from "../map/icons";
import type { Placer } from "../lib/place";
import { Section, SourceTag, Swatch, Switch, fmt, fmtValue } from "../ui";
import { pointLabel } from "../lib/pointLabel";
import { CELL_WIDTH_M } from "../lib/hexgrid";
import type { AppData } from "../data";
import { MAP } from "../lib/theme";

export type Visibility = Record<string, boolean>;
// 地圖 icon 預設全部不顯示，需要時再從「顯示 icon」打開
export const DEFAULT_VISIBILITY: Visibility = {};

const PLUS = "#4caf7d";
const MINUS = "#e0566a";

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
        fillColor: k < 0 ? MAP.empty : LEVELS[k].color,
        // 透明度固定，只靠顏色深淺分級，地圖上的深淺才會和圖例一致
        fillOpacity: k < 0 ? 0.04 : 0.62,
        color: isSelected ? MAP.selected : isRec ? MAP.emphasis : MAP.gridLine,
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

  // 點的圖層是蓋滿整張地圖的 canvas，會擋住下面六角格的 click；
  // 所以在地圖層級接 click，用座標換算是哪一格
  const cellSet = useMemo(() => new Set(cells), [cells]);
  const onMapClick = useCallback(
    (lat: number, lng: number) => {
      const cell = latLngToCell(lat, lng);
      if (cellSet.has(cell)) onSelect(cell);
    },
    [cellSet, onSelect]
  );

  return (
    <>
      <HexLayer cells={cells} style={hexStyle} onClick={onClick} tooltip={tooltip} />
      <MapClick onClick={onMapClick} />
      <PoiLayers data={data} layers={layers} visible={visible} />
    </>
  );
}

/** 住宅值是自訂的指數，畫面上不顯示數字，只顯示它換算後的分數或方向 */
const hidesValue = (ind: Indicator) => ind.layer === "residential" && ind.method !== "count" && ind.field === "homes";


/** 各圖層的點，其他分頁也會用到。全部畫成同樣大小的圖示 */
export function PoiLayers({ data, layers, visible }: { data: AppData; layers: DataLayer[]; visible: Visibility }) {
  const groups = useMemo(() => {
    const isSim = (key?: string) => data.sources.find((s) => s.key === key)?.real === false;
    return layers.map((layer) => ({
      key: layer.id, layer, icon: layer.icon, label: layer.label,
      points: layer.points.map((p): LabeledPoint => ({ lat: p.lat, lng: p.lng, label: pointLabel(layer, p, isSim(layer.source), layer.label, isSim) })),
    }));
  }, [data.sources, layers]);

  // 捷運、垃圾桶畫在最上面
  const order = (id: string) => (id === "mrt" ? 2 : id === "bins" ? 1 : 0);
  const shown = useMemo(
    () => groups.filter((g) => visible[g.layer.id]).map((g) => ({ ...g, order: order(g.layer.id) })),
    [groups, visible]
  );
  return shown.length ? <PoiLayer groups={shown} /> : null;
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
  /** 匯入資料的元件，放在「新增指標」旁邊 */
  importTool?: ReactNode;
  onRemoveLayer?: (id: string) => void;
}

export function RecommendPanel(props: PanelProps) {
  const { data, layers, indicators, result, recommendations, selected, onSelect, place } = props;
  const layerOf = (id: string) => layers.find((l) => l.id === id);
  const selectedResult = selected ? result.byCell.get(selected) : undefined;
  const detailRef = useRef<HTMLDivElement>(null);

  // 開關一個參數只決定算不算進指數；地圖上要顯示哪些點，由地圖左上角的圖層按鈕決定
  const toggle = useCallback(
    (k: number, on: boolean) => {
      props.onIndicators(indicators.map((x, i) => (i === k ? { ...x, enabled: on } : x)));
    },
    [indicators, props]
  );

  // 從清單或地圖選了一格，就把明細捲到看得到的地方
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <>
      <IntroBox />

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
        ) : null}
      </div>

      <IndicatorEditor
        indicators={indicators}
        onChange={props.onIndicators}
        onToggle={toggle}
        result={result}
        layers={layers}
        sources={data.sources}
        importTool={props.importTool}
      />

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

      <Section title="圖層資料">
        <ul className="layer-list">
          {layers.map((l) => (
            <li key={l.id}>
              <label>
                <span className="layer-icons">
                  <PoiIcon icon={l.icon} />
                </span>
                <span className="layer-name">
                  {l.label}
                  <small>{fmt(l.points.length)}</small>
                </span>
                {l.custom ? <span className="tag tag-import">匯入</span> : <SourceTag source={data.sources.find((s) => s.key === l.source)} />}
              </label>
              {l.custom && props.onRemoveLayer ? (
                <button className="link-button danger" onClick={() => props.onRemoveLayer!(l.id)} aria-label={`移除匯入的${l.label}`}>
                  移除
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="footnote">地圖上要顯示哪些圖層，用地圖左下角的「顯示 icon」。放大地圖，圓點會換成圖示；滑鼠移到點上可以看名稱。</p>
        <div className="legend">
          <span className="legend-item">
            <Swatch color={MAP.emptySwatch} shape="hex" />
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
  const rows = indicators.map((ind, j) => ({ ind, j })).filter(({ ind }) => isOn(ind) && ind.weight > 0);

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
                      {curveOf(ind) === "sqrt" ? "√(" : ""}
                      {hidesValue(ind) ? "住宅值 ÷ 上限" : <>{fmtValue(raw, unit)} {unit} ÷ {fmtValue(cap, unit)}</>}
                      {curveOf(ind) === "sqrt" ? ")" : ""}
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

function IndicatorEditor({ indicators, onChange, onToggle, result, layers, sources, importTool }: {
  indicators: Indicator[];
  onChange: (list: Indicator[]) => void;
  onToggle: (k: number, on: boolean) => void;
  result: IndexResult;
  layers: DataLayer[];
  sources: AppData["sources"];
  importTool?: ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  // 現有圖層還有沒用過的算法時，才顯示「用現有資料新增指標」
  const canAdd = layers.some((l) => freeMethods(l, indicators).length > 0);
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
            taken={usedMethods(indicators, ind.layer, ind.id)}
            sources={sources}
            onChange={(patch) => update(k, patch)}
            onToggle={(on) => onToggle(k, on)}
            onRemove={() => onChange(indicators.filter((_, i) => i !== k))}
          />
        ))}
      </ul>
      {adding && canAdd ? (
        <AddIndicator
          layers={layers}
          indicators={indicators}
          onAdd={(ind) => {
            onChange([...indicators, ind]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : canAdd ? (
        <div className="add-buttons">
          <button className="button add-button" onClick={() => setAdding(true)}>
            ＋ 用現有資料新增指標
          </button>
        </div>
      ) : null}
      {importTool}
      <p className="footnote">公車站權重較高，依據是環保局過去的設置作業程序：垃圾桶優先設在公車站牌多的地點。</p>
    </Section>
  );
}

export function SignToggle({ sign, onChange }: { sign: 1 | -1; onChange: (s: 1 | -1) => void }) {
  return (
    <div className="sign-toggle" role="group" aria-label="方向">
      <button className={sign > 0 ? "on plus" : ""} aria-pressed={sign > 0} onClick={() => onChange(1)}>
        ＋ 需要桶
      </button>
      <button className={sign < 0 ? "on minus" : ""} aria-pressed={sign < 0} onClick={() => onChange(-1)}>
        − 較不需要
      </button>
    </div>
  );
}

/** taken：已經被其他指標用掉的算法，選項會停用並標示 */
function MethodSelect({ layer, value, onChange, taken }: { layer: DataLayer; value: string; onChange: (v: string) => void; taken: Set<string> }) {
  const options = [
    { value: "count", label: `格內有幾${layer.unit}` },
    ...layer.fields.map((f) => ({ value: `sum:${f.key}`, label: `格內「${f.label}」加總` })),
  ];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={taken.has(o.value)}>
          {o.label}
          {taken.has(o.value) ? "（已有這個指標）" : ""}
        </option>
      ))}
    </select>
  );
}

function IndicatorCard({ ind, stat, layer, taken, sources, onChange, onToggle, onRemove }: {
  ind: Indicator;
  stat: IndexResult["stats"][number];
  layer?: DataLayer;
  taken: Set<string>;
  sources: AppData["sources"];
  onChange: (patch: Partial<Indicator>) => void;
  onToggle: (on: boolean) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const unit = indicatorUnit(ind, layer);
  const on = isOn(ind);

  return (
    <li className={`ind-card ${ind.sign > 0 ? "plus-card" : "minus-card"}${on && ind.weight > 0 ? "" : " off"}`}>
      <div className="ind-head">
        {layer ? <PoiIcon icon={layer.icon} size={18} /> : null}
        <span className="ind-label">{ind.label}</span>
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
          {methodText(ind, layer)}・{curveOf(ind) === "sqrt" ? "開根號・" : ""}上限 {fmtValue(stat.cap, unit)} {unit}
          {stat.auto ? (curveOf(ind) === "sqrt" ? "（自動：最大值）" : "（自動）") : ""}・{fmt(stat.fullShare * 100)}% 有資料的格子拿滿分
          {/* 資料標示接在計算說明的最後面 */}
          {layer?.custom ? <span className="tag tag-import">匯入</span> : <SourceTag source={sources.find((s) => s.key === indicatorSource(ind, layer))} />}
        </span>
      </div>
      <div className="story-controls">
        <label className="story-control">
          <span>加入需求計算：</span>
          <Switch on={on} onChange={onToggle} label={`把「${ind.label}」加入需求計算`} />
        </label>
        <button
          className={`small-button settings-toggle${open ? " active" : ""}`}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? `收起「${ind.label}」的計算方式` : `調整「${ind.label}」的計算方式`}
        >
          <span aria-hidden="true">⚙</span>
          {open ? "收起" : "調整計算方式"}
          <span aria-hidden="true" className="chev">{open ? "▴" : "▾"}</span>
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
                  taken={taken}
                  value={methodKey(ind)}
                  onChange={(v) =>
                    onChange(v === "count" ? { method: "count", field: undefined, cap: null } : { method: "sum", field: v.slice(4), cap: null })
                  }
                />
              </label>
              <label className="field-inline">
                <span>換算</span>
                <select value={curveOf(ind)} onChange={(e) => onChange({ curve: e.target.value === "sqrt" ? "sqrt" : "linear" })}>
                  <option value="linear">直接相除</option>
                  <option value="sqrt">相除後開根號</option>
                </select>
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
              <p className="footnote">
                上限留白＝自動。直接相除：有資料的格子中第 90 百分位的數值；相除後開根號：最大的那一格。格內數值超過上限就算滿分 1。開根號適合差距很大的數值，例如捷運人流。
              </p>
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

function AddIndicator({ layers, indicators, onAdd, onCancel }: {
  layers: DataLayer[];
  indicators: Indicator[];
  onAdd: (ind: Indicator) => void;
  onCancel: () => void;
}) {
  // 只列出還有算法沒被用掉的圖層，避免同一個指標加兩次
  const choices = layers.filter((l) => freeMethods(l, indicators).length > 0);
  const [layerId, setLayerId] = useState(choices[0]?.id ?? "");
  const layer = choices.find((l) => l.id === layerId);
  const [method, setMethod] = useState(layer ? freeMethods(layer, indicators)[0] : "count");
  const [sign, setSign] = useState<1 | -1>(1);

  const add = () => {
    if (!layer) return;
    const field = method.startsWith("sum:") ? method.slice(4) : undefined;
    const fieldLabel = layer.fields.find((f) => f.key === field)?.label;
    onAdd({
      id: `c${Date.now().toString(36)}`,
      label: fieldLabel ? `${layer.label}${fieldLabel}` : `${layer.label}數量`,
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
      <div className="form-title">用現有資料新增指標</div>
      <p className="footnote">
        從已經載入的圖層，用另一種算法再做一個指標（例如捷運站：人流加總是加分、站數是扣分）。要加入新的資料，例如公共廁所，請用下面的「匯入新資料」。
      </p>
      {choices.length === 0 ? (
        <p className="hint-box">現有圖層能算的指標都已經加了。要加入新的資料，請匯入 CSV。</p>
      ) : (
        <>
          <label className="field-inline">
            <span>圖層</span>
            <select
              value={layerId}
              onChange={(e) => {
                const next = choices.find((l) => l.id === e.target.value);
                setLayerId(e.target.value);
                if (next) setMethod(freeMethods(next, indicators)[0]);
              }}
            >
              {choices.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          {layer ? (
            <label className="field-inline">
              <span>怎麼算</span>
              <MethodSelect layer={layer} value={method} onChange={setMethod} taken={usedMethods(indicators, layer.id)} />
            </label>
          ) : null}
          <div className="field-inline">
            <span>方向</span>
            <SignToggle sign={sign} onChange={setSign} />
          </div>
        </>
      )}
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

// ---------------- 說明框 ----------------
// 格子大小、顏色意思、怎麼操作，加上分級圖例

function IntroBox() {
  const blockM = Math.round(CELL_WIDTH_M / 10) * 10;
  // 一般步行速度約 80 公尺／分鐘
  const walkMin = Math.max(1, Math.round(blockM / 80));
  return (
    <div className="hint-box">
      <p className="hint-text">
        地圖上每一格約 {fmt(blockM)} 公尺寬，大概是走路 {walkMin} 分鐘的距離。顏色越深，代表那一帶越缺垃圾桶。以下情境會增加或減少對垃圾桶的需求，你可以打開或關掉這些情境參數，看看哪裡最需要垃圾桶，也可以點任一格，看那裡為什麼缺（或不缺）垃圾桶。
      </p>
      <div className="legend">
        <span className="legend-item">
          <Swatch color={MAP.emptySwatch} shape="hex" />
          不缺
        </span>
        {LEVELS.map((l) => (
          <span key={l.label} className="legend-item">
            <Swatch color={l.color} shape="hex" />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
