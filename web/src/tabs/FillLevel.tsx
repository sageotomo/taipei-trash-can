// 滿桶狀況：每個智慧垃圾桶此刻填了幾 %。
// 看填滿度，右側用表格列出所有垃圾桶的即時狀況（地點、填滿度）。
//
// 填滿資料是一週的模擬（pipeline/04_fill_sim.py），用「現在是星期幾幾點」取同一個小時；
// 有智慧垃圾桶就會滿了才派車，所以即時畫面用 B 感測派車的結果。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PANES } from "../map/layers";
import { ImagePointLayer, type ImagePointStyle } from "../map/icons";
import { binPlaceNames } from "../lib/place";
import { fillStatus, type LiveTime } from "../lib/live";
import { Section, SourceTag, escapeHtml, fmt } from "../ui";
import type { AppData } from "../data";
import type { Strategy } from "../types";
import { MAP } from "../lib/theme";

const DAYS = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];
const LIVE: Strategy = "B";

// 顏色和垃圾桶圖示同色
export const FILL_COLORS = { ok: "#75c2b4", warn: "#e4c659", full: "#f06241" };

/** 垃圾桶圖示：有空位青綠、半滿黃、需清運橘紅（蓋子掀開） */
export const FILL_ICONS = {
  ok: `${import.meta.env.BASE_URL}icons/bin-ok.png`,
  warn: `${import.meta.env.BASE_URL}icons/bin-half.png`,
  full: `${import.meta.env.BASE_URL}icons/bin-full.png`,
};

export function levelIcon(level: number): string {
  if (level >= 80) return FILL_ICONS.full;
  if (level >= 50) return FILL_ICONS.warn;
  return FILL_ICONS.ok;
}

function FillIcon({ src, size = 22 }: { src: string; size?: number }) {
  return <img className="fill-icon" src={src} width={size} height={size} alt="" aria-hidden="true" />;
}

export function levelColor(level: number): string {
  if (level >= 80) return FILL_COLORS.full;
  if (level >= 50) return FILL_COLORS.warn;
  return FILL_COLORS.ok;
}

export function nowLabel(t: LiveTime): string {
  return `${DAYS[Math.floor(t.hour / 24) % 7]} ${t.clock}`;
}

export interface FillState {
  selected: number | null;
}

export const DEFAULT_FILL_STATE: FillState = { selected: null };

function useBinPoints(data: AppData) {
  return useMemo(
    () => data.bins.features.map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] })),
    [data.bins]
  );
}

// ---------------- 地圖 ----------------

interface LayerProps {
  data: AppData;
  time: LiveTime;
  state: FillState;
  onPickBin: (i: number) => void;
}

export function FillLayers({ data, time, state, onPickBin }: LayerProps) {
  const points = useBinPoints(data);
  const places = useMemo(() => binPlaceNames(data), [data]);
  const levels = data.fill.levels[LIVE];

  const style = useCallback(
    (i: number): ImagePointStyle => {
      const level = levels[i][time.hour];
      const picked = i === state.selected;
      return {
        src: levelIcon(level),
        scale: picked ? 1.35 : level >= 80 ? 1.1 : 0.9,
        ring: picked ? MAP.selected : undefined,
        front: picked || level >= 80,
      };
    },
    [levels, time.hour, state.selected]
  );

  // 提示文字含此刻的填滿度，所以每個整點重建一次
  const tooltip = useCallback(
    (i: number) => {
      const level = levels[i][time.hour];
      return `${escapeHtml(places[i])}<br><strong>填滿 ${level}%</strong>（${fillStatus(level).label}）`;
    },
    [levels, time.hour, places]
  );
  const hourPoints = useMemo(() => points.slice(), [points, time.hour]);

  return <ImagePointLayer points={hourPoints} style={style} pane={PANES.top} onClick={onPickBin} tooltip={tooltip} />;
}

// ---------------- 面板 ----------------

interface PanelProps {
  data: AppData;
  time: LiveTime;
  state: FillState;
  onChange: (s: FillState) => void;
  onFocusBin: (i: number) => void;
}

export function FillPanel(props: PanelProps) {
  const { data, time } = props;
  const levels = data.fill.levels[LIVE];
  const counts = useMemo(() => {
    const c = { ok: 0, warn: 0, full: 0 };
    for (const row of levels) c[fillStatus(row[time.hour]).tone]++;
    return c;
  }, [levels, time.hour]);
  const fillSource = data.sources.find((s) => s.key === "fill");

  return (
    <>
      <div className="live-head">
        <span className="live-dot" aria-hidden="true" />
        <strong>即時</strong>
        <span className="muted">{nowLabel(time)}</span>
        <SourceTag source={fillSource} />
      </div>
      <p className="lead">每個智慧垃圾桶裡的感測器會回報裝了幾 %。</p>

      <div className="fill-summary">
        <div>
          <FillIcon src={FILL_ICONS.ok} />
          <span>有空位</span>
          <strong>{fmt(counts.ok)}</strong>
        </div>
        <div>
          <FillIcon src={FILL_ICONS.warn} />
          <span>半滿</span>
          <strong>{fmt(counts.warn)}</strong>
        </div>
        <div>
          <FillIcon src={FILL_ICONS.full} />
          <span>需清運</span>
          <strong className="tone-full">{fmt(counts.full)}</strong>
        </div>
      </div>
      <p className="footnote">
        有空位：50% 以下　半滿：50–80%　需清運：80% 以上
      </p>

      <GovView {...props} />
    </>
  );
}

function FillBar({ level }: { level: number }) {
  return (
    <span className="fill-bar" aria-hidden="true">
      <span style={{ width: `${Math.min(level, 100)}%`, background: levelColor(level) }} />
    </span>
  );
}

// ---------------- 所有垃圾桶即時狀況表 ----------------

type SortKey = "place" | "level";
type Filter = "all" | "dispatch";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "dispatch", label: "需清運（80% 以上）" },
];

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: "place", label: "地點" },
  { key: "level", label: "填滿", num: true },
];

function GovView({ data, time, state, onChange, onFocusBin }: PanelProps) {
  const places = useMemo(() => binPlaceNames(data), [data]);
  const levels = data.fill.levels[LIVE];
  const [filter, setFilter] = useState<Filter>("all");
  const [district, setDistrict] = useState("全部");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "level", desc: true });
  const selectedRow = useRef<HTMLTableRowElement | null>(null);

  const districts = useMemo(
    () => ["全部", ...Array.from(new Set(data.bins.features.map((f) => f.properties.district))).sort()],
    [data.bins]
  );

  const rows = useMemo(() => {
    const q = query.trim();
    const idx = data.bins.features
      .map((f, i) => ({ i, f }))
      .filter(({ i, f }) => {
        if (district !== "全部" && f.properties.district !== district) return false;
        if (filter === "dispatch" && levels[i][time.hour] < 80) return false;
        if (q && !(places[i].includes(q) || f.properties.id.includes(q.toUpperCase()))) return false;
        return true;
      })
      .map(({ i }) => i);
    const value = (i: number): string | number => {
      switch (sort.key) {
        case "level":
          return levels[i][time.hour];
        default:
          return places[i];
      }
    };
    return idx.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const c = typeof va === "number" ? va - (vb as number) : va.localeCompare(vb as string, "zh-TW");
      return sort.desc ? -c : c;
    });
  }, [data.bins, district, filter, query, sort, levels, time.hour, places]);

  // 在地圖上點了某個桶，表格捲到那一列
  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.selected]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key === "level" }));

  const fillSource = data.sources.find((s) => s.key === "fill");

  return (
    <>
      <Section title="所有垃圾桶即時狀況" aside={<SourceTag source={fillSource} />}>
        <div className="table-tools">
          <div className="chips" role="radiogroup" aria-label="篩選">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="radio"
                aria-checked={filter === f.id}
                className={filter === f.id ? "chip active" : "chip"}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="table-filters">
            <label className="select">
              <span className="sr-only">行政區</span>
              <select value={district} onChange={(e) => setDistrict(e.target.value)}>
                {districts.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋地點、編號"
              aria-label="搜尋垃圾桶"
            />
          </div>
        </div>

        <p className="footnote">共 {fmt(rows.length)} 桶。點欄位名稱排序，點一列在地圖上找到它。</p>

        <div className="bin-table-wrap">
          <table className="bin-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={c.num ? "num" : undefined}
                    aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}
                  >
                    <button onClick={() => toggleSort(c.key)}>
                      {c.label}
                      <span className="sort-mark" aria-hidden="true">
                        {sort.key === c.key ? (sort.desc ? "▼" : "▲") : ""}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const level = levels[i][time.hour];
                const active = i === state.selected;
                return (
                  <tr
                    key={i}
                    ref={active ? selectedRow : undefined}
                    className={active ? "active" : undefined}
                    onClick={() => {
                      onChange({ ...state, selected: i });
                      onFocusBin(i);
                    }}
                  >
                    <td>
                      {places[i]}
                      <small>{data.bins.features[i].properties.id}</small>
                    </td>
                    <td className="num">
                      <span className="level-cell">
                        <FillBar level={level} />
                        <span className={level >= 80 ? "tone-full" : undefined}>{level}%</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="muted empty">沒有符合條件的垃圾桶。</p> : null}
        </div>
      </Section>

      <StrategyCompare data={data} />
    </>
  );
}

/** 一週模擬：為什麼要裝感測器（固定排程 vs 滿了才派車） */
function StrategyCompare({ data }: { data: AppData }) {
  const { fill } = data;
  const strategies: { id: Strategy; label: string; desc: string }[] = [
    {
      id: "A",
      label: "固定排程",
      desc: `每天 ${fill.fixed_hours.map((h) => `${String(h).padStart(2, "0")}:00`).join("、")} 各清一次`,
    },
    { id: "B", label: "感測派車", desc: `填到 ${Math.round(fill.dispatch_at * 100)}% 才派車` },
  ];
  return (
    <details className="compare">
      <summary>為什麼要裝感測器？一週清運模擬比較</summary>
      <div className="counters">
        {strategies.map((s) => (
          <div key={s.id} className={s.id === LIVE ? "counter active" : "counter"}>
            <div className="counter-title">{s.label}</div>
            <p className="footnote">{s.desc}</p>
            <dl>
              <div>
                <dt>滿溢小時數</dt>
                <dd>{fmt(fill.summary[s.id].overflow_hours)}</dd>
              </div>
              <div>
                <dt>出車次數</dt>
                <dd>{fmt(fill.summary[s.id].trips)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <p className="footnote">一週合計。滿溢小時數＝每個桶處於滿溢狀態的小時加總；每清一個桶算一次出車。上方即時畫面採用感測派車。</p>
    </details>
  );
}
