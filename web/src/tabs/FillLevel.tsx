// 滿桶狀況：每個智慧垃圾桶此刻填了幾 %。
// 看填滿度，右側用表格列出所有垃圾桶的即時狀況（地點、填滿度）。
//
// 填滿資料是一週的模擬（pipeline/04_fill_sim.py），用「現在是星期幾幾點」取同一個小時；
// 有智慧垃圾桶就會滿了才派車，所以即時畫面用 B 感測派車的結果。
// 感測器只試辦在大安區、中山區（lib/pilot.ts），這頁只看這兩區的垃圾桶，地圖上框出兩區邊界。
// 政府單位另外有「區域滿桶警示」：同一清潔隊轄區、300 m 內 3 桶以上 ≥90% 就跳通知（lib/fullAlert.ts）。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Polygon, Tooltip, useMap } from "react-leaflet";
import { PANES } from "../map/layers";
import { ImagePointLayer, type ImagePointStyle } from "../map/icons";
import { binPlaceNames } from "../lib/place";
import { fillStatus, type LiveTime } from "../lib/live";
import { Section, SourceTag, escapeHtml, fmt } from "../ui";
import type { AppData } from "../data";
import type { Strategy } from "../types";
import { MAP } from "../lib/theme";
import { DEMO_ALERT, demoBinIndices } from "../lib/demoAlert";
import { PILOT_LABEL, areaOutlines, pilotBinIndices, pilotSummary } from "../lib/pilot";
import { ALERT, findFullClusters, neighborIndex, nextAlertHour, type FullCluster } from "../lib/fullAlert";

const DAYS = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];
const LIVE: Strategy = "B";

/** 試辦區的淺橘色填色（不畫框線） */
const PILOT_FILL = "#f6a35c";

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

/** 試辦區裡的垃圾桶索引；這頁所有地方都只看這些桶 */
function usePilot(data: AppData) {
  return useMemo(() => pilotBinIndices(data.bins), [data.bins]);
}

function useBinPoints(data: AppData) {
  return useMemo(
    () => data.bins.features.map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] })),
    [data.bins]
  );
}

/** 此刻的區域滿桶警示；鄰居表只跟位置有關，只在換資料時重算 */
function useFullClusters(data: AppData, hour: number) {
  const pilot = usePilot(data);
  const bins = useMemo(
    () =>
      pilot.map((i) => data.bins.features[i]).map((f) => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        district: f.properties.district,
        road: f.properties.road,
      })),
    [data.bins, pilot]
  );
  const neighbors = useMemo(() => neighborIndex(bins), [bins]);
  const levels = useMemo(() => pilot.map((i) => data.fill.levels[LIVE][i]), [data.fill, pilot]);
  const demo = useMemo(() => demoBinIndices(data.bins), [data.bins]);
  const clusters = useMemo(
    () =>
      findFullClusters(bins, levels.map((row) => row[hour]), neighbors)
        // 分群用的是試辦區子集合的索引，換回全部垃圾桶的索引
        .map((c) => ({ ...c, members: c.members.map((k) => pilot[k]) }))
        .map((c) =>
          // Demo 的那一區用分隊名稱，和載入時跳出的通知一致
          demo.length && demo.every((i) => c.members.includes(i)) ? { ...c, team: DEMO_ALERT.team, demo: true } : c
        ),
    [bins, levels, neighbors, hour, demo, pilot]
  );
  return { bins, levels, neighbors, clusters };
}

// ---------------- 地圖 ----------------

interface LayerProps {
  data: AppData;
  time: LiveTime;
  state: FillState;
  onPickBin: (i: number) => void;
}

export function FillLayers({ data, time, state, onPickBin }: LayerProps) {
  const allPoints = useBinPoints(data);
  const places = useMemo(() => binPlaceNames(data), [data]);
  const levels = data.fill.levels[LIVE];
  const { clusters } = useFullClusters(data, time.hour);
  const pilot = usePilot(data);
  // 地圖只畫試辦區的桶；PointLayer 的索引 k 對應 pilot[k]
  const points = useMemo(() => pilot.map((i) => allPoints[i]), [pilot, allPoints]);
  const outlines = useMemo(() => areaOutlines(data.pilotArea), [data.pilotArea]);

  const style = useCallback(
    (k: number): ImagePointStyle => {
      const i = pilot[k];
      const level = levels[i][time.hour];
      const picked = i === state.selected;
      return {
        src: levelIcon(level),
        scale: picked ? 1.35 : level >= 80 ? 1.1 : 0.9,
        ring: picked ? MAP.selected : undefined,
        front: picked || level >= 80,
      };
    },
    [levels, time.hour, state.selected, pilot]
  );

  // 提示文字含此刻的填滿度，所以每個整點重建一次
  const tooltip = useCallback(
    (k: number) => {
      const i = pilot[k];
      const level = levels[i][time.hour];
      return `${escapeHtml(places[i])}<br><strong>填滿 ${level}%</strong>（${fillStatus(level).label}）`;
    },
    [levels, time.hour, places, pilot]
  );
  const hourPoints = useMemo(() => points.slice(), [points, time.hour]);
  const pickBin = useCallback((k: number) => onPickBin(pilot[k]), [onPickBin, pilot]);

  return (
    <>
      <FitPilot outlines={outlines} skip={state.selected !== null} />
      {outlines.map((o) => (
        <Polygon
          key={o.district}
          positions={o.rings}
          pathOptions={{ stroke: false, fillColor: PILOT_FILL, fillOpacity: 0.28 }}
          interactive={false}
        >
          <Tooltip direction="center" permanent className="pilot-label">
            {o.district}・感測器試辦區
          </Tooltip>
        </Polygon>
      ))}
      {clusters.map((c) => (
        <Circle
          key={c.key}
          center={[c.lat, c.lng]}
          radius={c.radiusM}
          pathOptions={{ color: FILL_COLORS.full, weight: 2, fillColor: FILL_COLORS.full, fillOpacity: 0.12, dashArray: "6 4" }}
          eventHandlers={{ click: () => onPickBin(c.members[0]) }}
        />
      ))}
      <ImagePointLayer points={hourPoints} style={style} pane={PANES.top} onClick={pickBin} tooltip={tooltip} />
    </>
  );
}

/** 進到這頁時把地圖拉到兩個試辦區（已經選了桶或位置就不動，例如從通知點進來） */
function FitPilot({ outlines, skip }: { outlines: { rings: [number, number][][] }[]; skip: boolean }) {
  const map = useMap();
  const skipRef = useRef(skip);
  useEffect(() => {
    if (skipRef.current) return;
    const pts = outlines.flatMap((o) => o.rings.flat());
    if (pts.length) map.fitBounds(pts, { padding: [24, 24] });
  }, [map, outlines]);
  return null;
}

// ---------------- 面板 ----------------

interface PanelProps {
  data: AppData;
  time: LiveTime;
  state: FillState;
  onChange: (s: FillState) => void;
  onFocusBin: (i: number) => void;
  onFocus: (lat: number, lng: number, zoom?: number) => void;
}

export function FillPanel(props: PanelProps) {
  const { data, time } = props;
  const levels = data.fill.levels[LIVE];
  const pilot = usePilot(data);
  const counts = useMemo(() => {
    const c = { ok: 0, warn: 0, full: 0 };
    for (const i of pilot) c[fillStatus(levels[i][time.hour]).tone]++;
    return c;
  }, [levels, time.hour, pilot]);
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
      <p className="pilot-note">
        感測器目前試辦於<strong>{PILOT_LABEL}</strong>，共 {fmt(pilot.length)} 個垃圾桶；其他行政區尚未安裝，這頁不顯示。
      </p>

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
        有空位：50% 以下　半滿：50–80%　需清運：80%
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

function GovView(props: PanelProps) {
  const { data, time, state, onChange, onFocusBin } = props;
  const places = useMemo(() => binPlaceNames(data), [data]);
  const levels = data.fill.levels[LIVE];
  const [filter, setFilter] = useState<Filter>("all");
  const [district, setDistrict] = useState("全部");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "level", desc: true });
  const selectedRow = useRef<HTMLTableRowElement | null>(null);

  const pilot = usePilot(data);
  const districts = useMemo(
    () => ["全部", ...Array.from(new Set(pilot.map((i) => data.bins.features[i].properties.district))).sort()],
    [data.bins, pilot]
  );

  const rows = useMemo(() => {
    const q = query.trim();
    const idx = pilot
      .map((i) => ({ i, f: data.bins.features[i] }))
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
  }, [data.bins, pilot, district, filter, query, sort, levels, time.hour, places]);

  // 在地圖上點了某個桶，表格捲到那一列
  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.selected]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key === "level" }));

  const fillSource = data.sources.find((s) => s.key === "fill");

  return (
    <>
      <FullAlerts {...props} />

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

// ---------------- 政府單位：區域滿桶警示 ----------------

function hourLabel(hour: number): string {
  return `${DAYS[Math.floor(hour / 24) % 7]} ${String(hour % 24).padStart(2, "0")}:00`;
}

function notifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function FullAlerts({ data, time, onFocus }: PanelProps) {
  const { bins, levels, neighbors, clusters } = useFullClusters(data, time.hour);
  const ids = (c: FullCluster) => c.members.map((i) => data.bins.features[i].properties.id);
  const next = useMemo(
    () => (clusters.length ? null : nextAlertHour(bins, levels, neighbors, time.hour)),
    [clusters.length, bins, levels, neighbors, time.hour]
  );

  // 新出現的警示才跳通知；同一區還沒清掉就不重複跳
  const seen = useRef<Set<string>>(new Set());
  const [toasts, setToasts] = useState<FullCluster[]>([]);
  const [desktop, setDesktop] = useState(() => notifySupported() && Notification.permission === "granted");

  useEffect(() => {
    // Demo 那一區載入時已經跳過通知，這裡不重複跳
    const fresh = clusters.filter((c) => !seen.current.has(c.key) && !c.demo);
    seen.current = new Set(clusters.map((c) => c.key));
    if (!fresh.length) return;
    setToasts((t) => [...fresh, ...t.filter((x) => clusters.some((c) => c.key === x.key))].slice(0, 3));
    if (desktop && notifySupported() && Notification.permission === "granted") {
      for (const c of fresh) {
        try {
          new Notification(`${c.team}：${c.members.length} 個垃圾桶快滿了`, {
            body: `${c.area}有 ${c.members.length} 個垃圾桶 ≥${ALERT.LEVEL}%，建議一起派車。`,
            tag: c.key,
          });
        } catch {
          // 有些瀏覽器（例如手機）不允許直接 new Notification，畫面上的通知還是會出現
        }
      }
    }
  }, [clusters, desktop]);

  useEffect(() => {
    if (!toasts.length) return;
    const id = window.setTimeout(() => setToasts((t) => t.slice(0, -1)), 10_000);
    return () => window.clearTimeout(id);
  }, [toasts]);

  const enableDesktop = async () => {
    if (!notifySupported()) return;
    const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setDesktop(p === "granted");
  };

  const focus = (c: FullCluster) => onFocus(c.lat, c.lng, 17);

  return (
    <>
      <Section
        title="區域滿桶警示"
        aside={
          clusters.length ? <span className="alert-count">{fmt(clusters.length)} 區</span> : undefined
        }
      >
        <p className="footnote">
          同一清潔隊轄區、{ALERT.RADIUS_M} 公尺內有 {ALERT.MIN_BINS} 個以上垃圾桶 ≥{ALERT.LEVEL}%，就會跳通知，建議一起派車。
        </p>
        {clusters.length === 0 ? (
          <p className="muted alert-empty">
            目前沒有。{next !== null ? `依模擬，下一次預計在 ${hourLabel(next)} 出現。` : ""}
          </p>
        ) : (
          <ul className="alert-list">
            {clusters.map((c) => (
              <li key={c.key}>
                <button className="alert-item" onClick={() => focus(c)}>
                  <span className="alert-team">{c.team}</span>
                  <span className="alert-area">
                    {c.area}・<strong>{c.members.length} 桶</strong> ≥{ALERT.LEVEL}%
                  </span>
                  <small>{ids(c).join("、")}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        {notifySupported() ? (
          desktop ? (
            <p className="footnote">已開啟桌面通知：切到別的分頁也會收到。</p>
          ) : (
            <button className="link-button" onClick={enableDesktop}>
              也用桌面通知提醒我
            </button>
          )
        ) : null}
      </Section>

      {toasts.length ? (
        <div className="alert-toasts" role="status" aria-live="polite">
          {toasts.map((c) => (
            <div key={c.key} className="alert-toast">
              <button className="alert-toast-main" onClick={() => focus(c)}>
                <strong>
                  {c.team}：{c.members.length} 個垃圾桶快滿了
                </strong>
                <span>
                  {c.area}，都已 ≥{ALERT.LEVEL}%。點這裡在地圖上查看。
                </span>
              </button>
              <button
                className="alert-toast-close"
                aria-label="關閉通知"
                onClick={() => setToasts((t) => t.filter((x) => x.key !== c.key))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

/** 一週模擬：為什麼要裝感測器（固定排程 vs 滿了才派車） */
function StrategyCompare({ data }: { data: AppData }) {
  const { fill } = data;
  const pilot = usePilot(data);
  const summary = useMemo(
    () => ({ A: pilotSummary(fill, pilot, "A"), B: pilotSummary(fill, pilot, "B") }),
    [fill, pilot]
  );
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
                <dd>{fmt(summary[s.id].overflow_hours)}</dd>
              </div>
              <div>
                <dt>出車次數</dt>
                <dd>{fmt(summary[s.id].trips)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <p className="footnote">試辦區（{PILOT_LABEL}）一週合計。滿溢小時數＝每個桶處於滿溢狀態的小時加總；每清一個桶算一次出車。上方即時畫面採用感測派車。</p>
    </details>
  );
}
