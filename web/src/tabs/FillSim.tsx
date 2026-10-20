import { useCallback, useEffect, useMemo, useState } from "react";
import type L from "leaflet";
import { PointLayer, PANES } from "../map/layers";
import { binPlaceNames } from "../lib/place";
import { Section, SourceTag, Swatch, fmt } from "../ui";
import type { AppData } from "../data";
import type { Strategy } from "../types";

const DAYS = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];
const LOOKAHEAD = 6; // 預測未來幾小時內會滿

export const FILL_COLORS = { ok: "#3c9a5f", warn: "#e3b23c", full: "#d1495b" };

export function levelColor(level: number): string {
  if (level >= 80) return FILL_COLORS.full;
  if (level >= 50) return FILL_COLORS.warn;
  return FILL_COLORS.ok;
}

export function hourLabel(t: number): string {
  return `${DAYS[Math.floor(t / 24) % 7]} ${String(t % 24).padStart(2, "0")}:00`;
}

const STRATEGIES: { id: Strategy; label: string; desc: (d: AppData) => string }[] = [
  {
    id: "A",
    label: "A 固定排程",
    desc: (d) => `每天 ${d.fill.fixed_hours.map((h) => `${String(h).padStart(2, "0")}:00`).join("、")} 各清一次，不管滿不滿。`,
  },
  {
    id: "B",
    label: "B 感測派車",
    desc: (d) => `感測器回報填到 ${Math.round(d.fill.dispatch_at * 100)}% 就派車，下一個小時清空。`,
  },
];

export interface FillState {
  hour: number;
  strategy: Strategy;
}

// ---------------- 地圖 ----------------

export function FillLayers({ data, state, onPick }: { data: AppData; state: FillState; onPick: (i: number) => void }) {
  const points = useMemo(
    () => data.bins.features.map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] })),
    [data.bins]
  );
  const levels = data.fill.levels[state.strategy];

  const style = useCallback(
    (i: number): L.CircleMarkerOptions => {
      const level = levels[i][state.hour];
      const full = level >= 100;
      return {
        radius: full ? 7 : 5,
        fillColor: levelColor(level),
        fillOpacity: 0.95,
        color: full ? "#5b1a08" : "#ffffff",
        weight: full ? 2 : 1,
      };
    },
    [levels, state.hour]
  );

  const tooltip = useCallback((i: number) => data.bins.features[i].properties.id, [data.bins]);

  return <PointLayer points={points} style={style} pane={PANES.top} onClick={onPick} tooltip={tooltip} />;
}

// ---------------- 面板 ----------------

interface Props {
  data: AppData;
  state: FillState;
  onChange: (s: FillState) => void;
  onFocusBin: (i: number) => void;
}

export function FillPanel({ data, state, onChange, onFocusBin }: Props) {
  const [playing, setPlaying] = useState(false);
  const { fill } = data;
  const places = useMemo(() => binPlaceNames(data), [data]);

  // 播放：每 300 ms 前進一小時，到最後一小時就回到開頭
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      onChange({ ...state, hour: (state.hour + 1) % fill.hours });
    }, 300);
    return () => window.clearInterval(id);
  }, [playing, state, onChange, fill.hours]);

  const levels = fill.levels[state.strategy];
  const fullNow = useMemo(() => levels.filter((row) => row[state.hour] >= 100).length, [levels, state.hour]);

  // 即將滿溢：現在已滿，或未來 LOOKAHEAD 小時內會滿
  const soon = useMemo(() => {
    const items: { i: number; level: number; hoursLeft: number }[] = [];
    levels.forEach((row, i) => {
      for (let k = 0; k <= LOOKAHEAD && state.hour + k < fill.hours; k++) {
        if (row[state.hour + k] >= 100) {
          items.push({ i, level: row[state.hour], hoursLeft: k });
          break;
        }
      }
    });
    // 同樣急迫時，先派給一週內最常滿的桶
    const chronic = fill.overflow[state.strategy];
    return items
      .sort((a, b) => a.hoursLeft - b.hoursLeft || b.level - a.level || chronic[b.i] - chronic[a.i])
      .slice(0, 10);
  }, [levels, state.hour, state.strategy, fill.hours, fill.overflow]);

  const fillSource = data.sources.find((s) => s.key === "fill");

  return (
    <>
      <p className="lead">
        假設每個垃圾桶都裝了填滿感測器<SourceTag source={fillSource} />。比較「定時巡邏」和「滿了才派車」一週下來的差別。
      </p>

      <div className="segmented" role="radiogroup" aria-label="清運策略">
        {STRATEGIES.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={state.strategy === s.id}
            className={state.strategy === s.id ? "segment active" : "segment"}
            onClick={() => onChange({ ...state, strategy: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="footnote">{STRATEGIES.find((s) => s.id === state.strategy)!.desc(data)}</p>

      <div className="counters">
        {STRATEGIES.map((s) => (
          <div key={s.id} className={state.strategy === s.id ? "counter active" : "counter"}>
            <div className="counter-title">{s.label}</div>
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
      <p className="footnote">一週合計。滿溢小時數 = 每個桶處於滿溢狀態的小時加總；每清一個桶算一次出車。</p>

      <Section title="時間">
        <div className="timeline">
          <button
            className="play"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "暫停" : "播放"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <input
            type="range"
            min={0}
            max={fill.hours - 1}
            value={state.hour}
            onChange={(e) => {
              setPlaying(false);
              onChange({ ...state, hour: Number(e.target.value) });
            }}
            aria-label="時間"
          />
        </div>
        <div className="time-now">
          <strong>{hourLabel(state.hour)}</strong>
          <span className="muted">此刻滿溢 {fullNow} 桶</span>
        </div>
        <div className="legend">
          <span className="legend-item"><Swatch color={FILL_COLORS.ok} />50% 以下</span>
          <span className="legend-item"><Swatch color={FILL_COLORS.warn} />50–80%</span>
          <span className="legend-item"><Swatch color={FILL_COLORS.full} />80% 以上</span>
        </div>
      </Section>

      <Section title="派車建議：即將滿溢前 10 名">
        {soon.length === 0 ? (
          <p className="muted">未來 {LOOKAHEAD} 小時內沒有桶會滿。</p>
        ) : (
          <ol className="rank-list">
            {soon.map(({ i, level, hoursLeft }, k) => (
              <li key={i}>
                <button className="rank-item" onClick={() => onFocusBin(i)}>
                  <span className="rank-no">{k + 1}</span>
                  <span className="rank-main">
                    {places[i]}
                    <small>
                      {data.bins.features[i].properties.id}・目前 {level}%
                    </small>
                  </span>
                  <span className={hoursLeft === 0 ? "pill pill-full" : "pill"}>
                    {hoursLeft === 0 ? "已滿溢" : `${hoursLeft} 小時內`}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}
