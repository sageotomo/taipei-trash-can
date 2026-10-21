// 垃圾桶填滿度：每個智慧垃圾桶此刻填了幾 %。
// 市民：看填滿度、用自己的位置找附近還有空位的垃圾桶。
// 政府單位：看填滿度，右側用表格列出所有垃圾桶的即時狀況（填滿、電量、廠牌、贊助商）。
//
// 填滿資料是一週的模擬（pipeline/04_fill_sim.py），用「現在是星期幾幾點」取同一個小時；
// 有智慧垃圾桶就會滿了才派車，所以即時畫面用 B 感測派車的結果。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type L from "leaflet";
import { Circle, CircleMarker } from "react-leaflet";
import { MapClick, PointLayer, PANES } from "../map/layers";
import { binPlaceNames } from "../lib/place";
import { fillStatus, nearest, walkMinutes, type LiveTime } from "../lib/live";
import type { Role } from "../lib/role";
import { Section, SourceTag, Swatch, escapeHtml, fmt } from "../ui";
import type { AppData } from "../data";
import type { Strategy } from "../types";

const DAYS = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];
const LIVE: Strategy = "B";
const NEARBY = 5;
const NEARBY_MAX_M = 1500;
const LOW_BATTERY = 20;

export const FILL_COLORS = { ok: "#3c9a5f", warn: "#e3b23c", full: "#d1495b" };

export function levelColor(level: number): string {
  if (level >= 80) return FILL_COLORS.full;
  if (level >= 50) return FILL_COLORS.warn;
  return FILL_COLORS.ok;
}

export function nowLabel(t: LiveTime): string {
  return `${DAYS[Math.floor(t.hour / 24) % 7]} ${t.clock}`;
}

export interface UserLocation {
  lat: number;
  lng: number;
  label: string;
}

export interface FillState {
  location: UserLocation | null;
  selected: number | null;
}

export const DEFAULT_FILL_STATE: FillState = { location: null, selected: null };

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
  role: Role;
  state: FillState;
  onPickBin: (i: number) => void;
  onPickLocation: (loc: UserLocation) => void;
}

export function FillLayers({ data, time, role, state, onPickBin, onPickLocation }: LayerProps) {
  const points = useBinPoints(data);
  const places = useMemo(() => binPlaceNames(data), [data]);
  const levels = data.fill.levels[LIVE];

  const nearbySet = useMemo(() => {
    if (role !== "citizen" || !state.location) return new Set<number>();
    const { lat, lng } = state.location;
    return new Set(nearest(points, lat, lng, NEARBY).filter((r) => r.d <= NEARBY_MAX_M).map((r) => r.i));
  }, [role, state.location, points]);

  const style = useCallback(
    (i: number): L.CircleMarkerOptions => {
      const level = levels[i][time.hour];
      const full = level >= 100;
      const picked = i === state.selected || nearbySet.has(i);
      return {
        radius: picked ? 8 : full ? 7 : 5,
        fillColor: levelColor(level),
        fillOpacity: 0.95,
        color: picked ? "#1b2a2f" : full ? "#5b1a08" : "#ffffff",
        weight: picked ? 3 : full ? 2 : 1,
      };
    },
    [levels, time.hour, state.selected, nearbySet]
  );

  // 提示文字含此刻的填滿度，所以每個整點重建一次
  const tooltip = useCallback(
    (i: number) => {
      const level = levels[i][time.hour];
      const extra = role === "gov" ? `・電量 ${data.smartBins[i]?.battery ?? "—"}%` : "";
      return `${escapeHtml(places[i])}<br><strong>填滿 ${level}%</strong>（${fillStatus(level).label}）${extra}`;
    },
    [levels, time.hour, role, places, data.smartBins]
  );
  const hourPoints = useMemo(() => points.slice(), [points, time.hour, role]);

  return (
    <>
      {role === "citizen" ? (
        <MapClick onClick={(lat, lng) => onPickLocation({ lat, lng, label: "地圖上選的位置" })} />
      ) : null}
      <PointLayer points={hourPoints} style={style} pane={PANES.top} onClick={onPickBin} tooltip={tooltip} />
      {role === "citizen" && state.location ? (
        <>
          <Circle
            center={[state.location.lat, state.location.lng]}
            radius={500}
            pathOptions={{ color: "#2b6cb0", weight: 1, fillOpacity: 0.06, dashArray: "4 4" }}
            interactive={false}
          />
          <CircleMarker
            center={[state.location.lat, state.location.lng]}
            radius={8}
            pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#2b6cb0", fillOpacity: 1 }}
            interactive={false}
          />
        </>
      ) : null}
    </>
  );
}

// ---------------- 面板 ----------------

interface PanelProps {
  data: AppData;
  time: LiveTime;
  role: Role;
  state: FillState;
  onChange: (s: FillState) => void;
  onFocusBin: (i: number) => void;
  onFocus: (lat: number, lng: number, zoom?: number) => void;
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
  const gov = props.role === "gov";
  const lowBattery = useMemo(() => data.smartBins.filter((s) => s.battery < LOW_BATTERY).length, [data.smartBins]);

  return (
    <>
      <div className="live-head">
        <span className="live-dot" aria-hidden="true" />
        <strong>即時</strong>
        <span className="muted">{nowLabel(time)}</span>
        <SourceTag source={fillSource} />
      </div>
      <p className="lead">每個智慧垃圾桶裡的感測器會回報裝了幾 %。</p>

      <div className={gov ? "fill-summary four" : "fill-summary"}>
        <div>
          <Swatch color={FILL_COLORS.ok} />
          <span>有空位</span>
          <strong>{fmt(counts.ok)}</strong>
        </div>
        <div>
          <Swatch color={FILL_COLORS.warn} />
          <span>半滿</span>
          <strong>{fmt(counts.warn)}</strong>
        </div>
        <div>
          <Swatch color={FILL_COLORS.full} />
          <span>{gov ? "需清運" : "快滿／已滿"}</span>
          <strong className={gov ? "tone-full" : undefined}>{fmt(counts.full)}</strong>
        </div>
        {gov ? (
          <div>
            <span className="battery-icon" aria-hidden="true" />
            <span>低電量</span>
            <strong className="tone-warn">{fmt(lowBattery)}</strong>
          </div>
        ) : null}
      </div>
      <p className="footnote">
        有空位：50% 以下　半滿：50–80%　{gov ? "需清運" : "快滿"}：80% 以上{gov ? `　低電量：${LOW_BATTERY}% 以下` : ""}
      </p>

      {props.role === "citizen" ? <CitizenView {...props} /> : <GovView {...props} />}
    </>
  );
}

// ---------------- 市民：找附近的垃圾桶 ----------------

interface Candidate {
  label: string;
  sub: string;
  lat: number;
  lng: number;
}

function CitizenView({ data, time, state, onChange, onFocusBin, onFocus }: PanelProps) {
  const points = useBinPoints(data);
  const places = useMemo(() => binPlaceNames(data), [data]);
  const levels = data.fill.levels[LIVE];
  const [query, setQuery] = useState("");
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // 可搜尋的地點：捷運站＋垃圾桶所在路名（都在本機資料裡，不需要連外查地址）
  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = [];
    for (const f of data.pois.features) {
      if (f.properties.kind !== "mrt" || !f.properties.name) continue;
      const name = f.properties.name.endsWith("站") ? f.properties.name : `${f.properties.name}站`;
      out.push({ label: `捷運${name}`, sub: f.properties.district ?? "", lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });
    }
    const seen = new Set<string>();
    for (const f of data.bins.features) {
      const road = f.properties.road;
      if (!road || seen.has(road)) continue;
      seen.add(road);
      out.push({ label: road, sub: f.properties.district, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });
    }
    return out;
  }, [data]);

  const matches = useMemo(() => {
    const q = query.trim().replace(/臺/g, "台");
    if (!q) return [];
    return candidates.filter((c) => c.label.replace(/臺/g, "台").includes(q) || c.sub.includes(q)).slice(0, 6);
  }, [query, candidates]);

  const setLocation = (loc: UserLocation) => {
    onChange({ ...state, location: loc });
    onFocus(loc.lat, loc.lng, 16);
  };

  const geolocate = () => {
    if (!("geolocation" in navigator)) {
      setGeoMsg("這個瀏覽器不支援定位，請改用搜尋或點地圖。");
      return;
    }
    setLocating(true);
    setGeoMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "你目前的位置" });
      },
      (err) => {
        setLocating(false);
        setGeoMsg(
          err.code === err.PERMISSION_DENIED
            ? "沒有定位權限。可以在瀏覽器允許定位，或改用搜尋、點地圖。"
            : "暫時抓不到位置，請改用搜尋或點地圖。"
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  };

  const near = useMemo(() => {
    if (!state.location) return [];
    return nearest(points, state.location.lat, state.location.lng, NEARBY).filter((r) => r.d <= NEARBY_MAX_M);
  }, [points, state.location]);
  // 建議去：最近一個還沒快滿的
  const suggested = near.find((r) => levels[r.i][time.hour] < 80)?.i;

  return (
    <>
      <Section title="找附近的垃圾桶">
        <button className="button primary locate" onClick={geolocate} disabled={locating}>
          {locating ? "定位中…" : "使用我目前的位置"}
        </button>
        {geoMsg ? <p className="footnote warn-text">{geoMsg}</p> : null}

        <div className="place-search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="或輸入捷運站、路名，例如：西門、忠孝東路"
            aria-label="搜尋地點"
          />
          {matches.length > 0 ? (
            <ul className="place-results">
              {matches.map((c) => (
                <li key={c.label + c.lat}>
                  <button
                    onClick={() => {
                      setQuery("");
                      setLocation({ lat: c.lat, lng: c.lng, label: c.label });
                    }}
                  >
                    {c.label}
                    <small>{c.sub}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() ? (
            <p className="footnote">找不到「{query.trim()}」，換個關鍵字，或直接點地圖。</p>
          ) : null}
        </div>
        <p className="footnote">也可以直接點地圖選位置。</p>
      </Section>

      {state.location ? (
        <Section
          title="離你最近的垃圾桶"
          aside={
            <button className="link-button" onClick={() => onChange({ ...state, location: null })}>
              清除
            </button>
          }
        >
          <p className="muted near-from">從「{state.location.label}」出發</p>
          {near.length === 0 ? (
            <p className="muted">1.5 公里內沒有垃圾桶。這一帶可能不在研究範圍內，或真的很缺垃圾桶。</p>
          ) : (
            <ol className="near-list">
              {near.map(({ i, d }) => {
                const level = levels[i][time.hour];
                const st = fillStatus(level);
                return (
                  <li key={i}>
                    <button className={i === suggested ? "near-item suggested" : "near-item"} onClick={() => onFocusBin(i)}>
                      <span className="near-main">
                        {i === suggested ? <span className="badge">建議去這個</span> : null}
                        {places[i]}
                        <small>
                          步行約 {walkMinutes(d)} 分鐘・{fmt(Math.round(d / 10) * 10)} m
                        </small>
                      </span>
                      <span className="near-level">
                        <FillBar level={level} />
                        <span className={`fill-label tone-${st.tone}`}>
                          {st.label} {level}%
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
      ) : null}
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

// ---------------- 政府單位：所有垃圾桶即時狀況表 ----------------

type SortKey = "place" | "level" | "battery" | "brand" | "sponsor";
type Filter = "all" | "dispatch" | "battery";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "dispatch", label: "需清運（80% 以上）" },
  { id: "battery", label: `低電量（${LOW_BATTERY}% 以下）` },
];

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: "place", label: "地點" },
  { key: "level", label: "填滿", num: true },
  { key: "battery", label: "電量", num: true },
  { key: "brand", label: "廠牌" },
  { key: "sponsor", label: "贊助商" },
];

function GovView({ data, time, state, onChange, onFocusBin }: PanelProps) {
  const places = useMemo(() => binPlaceNames(data), [data]);
  const levels = data.fill.levels[LIVE];
  const smart = data.smartBins;
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
        if (filter === "battery" && smart[i].battery >= LOW_BATTERY) return false;
        if (q && !(places[i].includes(q) || f.properties.id.includes(q.toUpperCase()) || smart[i].sponsor.includes(q) || smart[i].brand.includes(q)))
          return false;
        return true;
      })
      .map(({ i }) => i);
    const value = (i: number): string | number => {
      switch (sort.key) {
        case "level":
          return levels[i][time.hour];
        case "battery":
          return smart[i].battery;
        case "brand":
          return smart[i].brand;
        case "sponsor":
          return smart[i].sponsor;
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
  }, [data.bins, district, filter, query, sort, levels, time.hour, smart, places]);

  // 在地圖上點了某個桶，表格捲到那一列
  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.selected]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key === "level" }));

  const smartSource = data.sources.find((s) => s.key === "smart_bins");

  return (
    <>
      <Section title="所有垃圾桶即時狀況" aside={<SourceTag source={smartSource} />}>
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
              placeholder="搜尋地點、編號、贊助商"
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
                const s = smart[i];
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
                    <td className={s.battery < LOW_BATTERY ? "num tone-warn strong" : "num"}>{s.battery}%</td>
                    <td className="nowrap" title={s.brand}>{s.brand.split(" ")[0]}</td>
                    <td className="nowrap">{s.sponsor}</td>
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
