import { useCallback, useMemo, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { useAppData } from "./data";
import { computeScores, DEFAULT_WEIGHTS, pickRecommendations } from "./lib/score";
import { hexCenter } from "./lib/hex";
import { FlyTo, MapClick, MapPanes } from "./map/layers";
import { latLngToCell } from "h3-js";
import {
  H3_RES,
  addLocalReport,
  clearLocalReports,
  createReport,
  loadLocalReports,
  removeLocalReport,
  type Category,
} from "./lib/reports";
import { ReportLayers, ReportPanel, type Draft } from "./tabs/Reports";
import { ProgressLayers, ProgressPanel } from "./tabs/Progress";
import { DEFAULT_LAYERS, PoiLayers, RecommendLayers, RecommendPanel, type LayerVisibility } from "./tabs/Recommend";
import { FillLayers, FillPanel, type FillState } from "./tabs/FillSim";
import type { Report, Weights } from "./types";

export type TabId = "recommend" | "fill" | "reports" | "progress";

const TABS: { id: TabId; label: string }[] = [
  { id: "recommend", label: "增設建議" },
  { id: "fill", label: "填滿模擬" },
  { id: "reports", label: "市民通報" },
  { id: "progress", label: "施政進度" },
];

// 台北市中心
const CENTER: [number, number] = [25.045, 121.535];

export type Focus = { lat: number; lng: number; zoom?: number; key: number } | null;

export default function App() {
  const { data, error } = useAppData();
  const [tab, setTab] = useState<TabId>("recommend");
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [selected, setSelected] = useState<number | null>(null);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [focus, setFocus] = useState<Focus>(null);
  const [localReports, setLocalReports] = useState<Report[]>(loadLocalReports);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reportCell, setReportCell] = useState<number | null>(null);
  const [district, setDistrict] = useState("全部");
  const [progressSelected, setProgressSelected] = useState<number | null>(null);
  const [fillState, setFillState] = useState<FillState>({ hour: 18, strategy: "A" }) // 週一 18:00 下班尖峰;

  const flyTo = useCallback((lat: number, lng: number, zoom = 16) => {
    setFocus({ lat, lng, zoom, key: Date.now() });
  }, []);

  const cellIndex = useMemo(() => new Map((data?.grid ?? []).map((c, i) => [c.h3, i])), [data]);
  const allReports = useMemo(() => [...(data?.reportsSeed ?? []), ...localReports], [data, localReports]);

  // 每格通報數：歷史通報＋這台裝置新增的通報。增設建議的「市民通報」特徵也用這個，所以通報會即時影響缺口
  const reportCounts = useMemo(() => {
    const counts = new Array<number>(data?.grid.length ?? 0).fill(0);
    for (const r of allReports) {
      const i = cellIndex.get(r.h3);
      if (i !== undefined) counts[i]++;
    }
    return counts;
  }, [data, allReports, cellIndex]);

  const scores = useMemo(
    () => (data ? computeScores(data.grid, weights, reportCounts) : []),
    [data, weights, reportCounts]
  );
  const recommendations = useMemo(() => pickRecommendations(scores, weights), [scores, weights]);
  const recommendedSet = useMemo(() => new Set(recommendations.map((r) => r.index)), [recommendations]);

  const selectCell = useCallback(
    (index: number | null, fly = false) => {
      setSelected(index);
      if (index !== null && fly && data) {
        const [lat, lng] = hexCenter(data.grid[index].h3);
        flyTo(lat, lng);
      }
    },
    [data, flyTo]
  );

  const pickReportLocation = useCallback(
    (lat: number, lng: number) => {
      setDraft({ lat, lng });
      setReportCell(cellIndex.get(latLngToCell(lat, lng, H3_RES)) ?? null);
    },
    [cellIndex]
  );

  const submitReport = useCallback(
    (category: Category, note: string) => {
      if (!draft) return;
      setLocalReports((prev) => addLocalReport(prev, createReport({ category, note, ...draft })));
      setDraft(null);
    },
    [draft]
  );

  const selectProgress = useCallback(
    (i: number) => {
      if (!data) return;
      setProgressSelected(i);
      flyTo(data.progress[i].lat, data.progress[i].lng, 16);
    },
    [data, flyTo]
  );

  const focusBin = useCallback(
    (i: number) => {
      if (!data) return;
      const [lng, lat] = data.bins.features[i].geometry.coordinates;
      flyTo(lat, lng, 17);
    },
    [data, flyTo]
  );

  return (
    <div className="app">
      <MapContainer center={CENTER} zoom={13} className="map" zoomControl>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />
        <MapPanes />
        <FlyTo target={focus} />
        {data && tab === "recommend" ? (
          <RecommendLayers
            data={data}
            scores={scores}
            recommended={recommendedSet}
            selected={selected}
            onSelect={(i) => selectCell(i)}
            layers={layers}
          />
        ) : null}
        {data && tab === "fill" ? (
          <>
            <PoiLayers data={data} layers={{ mrt: true }} />
            <FillLayers data={data} state={fillState} onPick={focusBin} />
          </>
        ) : null}
        {data && tab === "reports" ? (
          <>
            <MapClick onClick={pickReportLocation} />
            <ReportLayers
              data={data}
              reports={allReports}
              reportCounts={reportCounts}
              selected={reportCell}
              draft={draft}
            />
          </>
        ) : null}
        {data && tab === "progress" ? (
          <ProgressLayers data={data} district={district} selected={progressSelected} onSelect={selectProgress} />
        ) : null}
      </MapContainer>

      <aside className="panel">
        <header className="panel-header">
          <h1>找回消失的垃圾桶</h1>
          <p>台北行人垃圾桶從近 3,000 組剩下約 800 組。哪裡最缺？為什麼？</p>
        </header>

        <nav className="tabs" role="tablist" aria-label="功能">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "tab active" : "tab"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <section className="panel-body">
          {error ? <p className="error">{error}</p> : null}
          {!data && !error ? <p className="muted">資料載入中。</p> : null}
          {data && tab === "recommend" ? (
            <RecommendPanel
              data={data}
              scores={scores}
              recommendations={recommendations}
              weights={weights}
              onWeights={setWeights}
              selected={selected}
              onSelect={selectCell}
              layers={layers}
              onLayers={setLayers}
              reportCounts={reportCounts}
            />
          ) : null}
          {data && tab === "fill" ? (
            <FillPanel data={data} state={fillState} onChange={setFillState} onFocusBin={focusBin} />
          ) : null}
          {data && tab === "reports" ? (
            <ReportPanel
              data={data}
              reports={allReports}
              localReports={localReports}
              reportCounts={reportCounts}
              selected={reportCell}
              draft={draft}
              onSubmit={submitReport}
              onCancel={() => setDraft(null)}
              onDelete={(id) => setLocalReports((prev) => removeLocalReport(prev, id))}
              onClear={() => setLocalReports(clearLocalReports())}
              onFocus={(lat, lng) => {
                flyTo(lat, lng, 17);
                setReportCell(cellIndex.get(latLngToCell(lat, lng, H3_RES)) ?? null);
              }}
            />
          ) : null}
          {data && tab === "progress" ? (
            <ProgressPanel
              data={data}
              district={district}
              onDistrict={setDistrict}
              selected={progressSelected}
              onSelect={selectProgress}
            />
          ) : null}
        </section>
      </aside>
    </div>
  );
}
