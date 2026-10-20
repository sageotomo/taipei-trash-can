import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer } from "react-leaflet";
import { BaseMap } from "./map/basemap";
import { useAppData } from "./data";
import {
  DEFAULT_INDICATORS,
  aggregate,
  cellUniverse,
  computeIndex,
  pickRecommendations,
  type DataLayer,
  type Indicator,
} from "./lib/indicators";
import { reportsLayer, staticLayers } from "./lib/datalayers";
import { makePlacer } from "./lib/place";
import { makeProgress } from "./lib/progress";
import { loadCustomLayers, loadIndicators, saveCustomLayers, saveIndicators } from "./lib/storage";
import { cellCenter, latLngToCell } from "./lib/hexgrid";
import { FlyTo, MapClick, MapPanes } from "./map/layers";
import { CellScale } from "./map/CellScale";
import {
  addLocalReport,
  clearLocalReports,
  createReport,
  loadLocalReports,
  removeLocalReport,
  type Category,
} from "./lib/reports";
import { ReportLayers, ReportPanel, type Draft } from "./tabs/Reports";
import { ProgressLayers, ProgressPanel } from "./tabs/Progress";
import { DEFAULT_VISIBILITY, PoiLayers, RecommendLayers, RecommendPanel, type Visibility } from "./tabs/Recommend";
import { FillLayers, FillPanel, type FillState } from "./tabs/FillSim";
import { ImportLayer, type ImportOptions } from "./tabs/ImportLayer";
import type { Report } from "./types";
import { loadRole, saveRole, type Role } from "./lib/role";
import { RoleToggle } from "./ui";

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
  const [role, setRole] = useState<Role>(loadRole);
  useEffect(() => saveRole(role), [role]);
  const [indicators, setIndicators] = useState<Indicator[]>(loadIndicators);
  const [selected, setSelected] = useState<string | null>(null);
  const [visible, setVisible] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [focus, setFocus] = useState<Focus>(null);
  const [localReports, setLocalReports] = useState<Report[]>(loadLocalReports);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reportCell, setReportCell] = useState<string | null>(null);
  const [district, setDistrict] = useState("全部");
  const [progressSelected, setProgressSelected] = useState<number | null>(null);
  const [fillState, setFillState] = useState<FillState>({ hour: 18, strategy: "A" }); // 週一 18:00 下班尖峰

  const [customLayers, setCustomLayers] = useState<DataLayer[]>(loadCustomLayers);
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => saveIndicators(indicators), [indicators]);
  useEffect(() => setStorageOk(saveCustomLayers(customLayers)), [customLayers]);

  const flyTo = useCallback((lat: number, lng: number, zoom = 16) => {
    setFocus({ lat, lng, zoom, key: Date.now() });
  }, []);

  const allReports = useMemo(() => [...(data?.reportsSeed ?? []), ...localReports], [data, localReports]);
  const place = useMemo(() => (data ? makePlacer(data) : null), [data]);

  // ---- 圖層與缺桶指數 ----
  // 固定圖層只建一次；通報圖層隨使用者新增而變；權重改變時只重算分數，不重新分格
  const fixedLayers = useMemo(() => (data ? staticLayers(data) : []), [data]);
  const layers = useMemo(() => [...fixedLayers, reportsLayer(allReports), ...customLayers], [fixedLayers, allReports, customLayers]);
  const agg = useMemo(() => aggregate(layers), [layers]);
  const cells = useMemo(() => cellUniverse(agg), [agg]);
  const result = useMemo(() => computeIndex(agg, cells, indicators), [agg, cells, indicators]);
  const recommendations = useMemo(() => pickRecommendations(result), [result]);
  const recommendedSet = useMemo(() => new Set(recommendations.map((r) => r.cell)), [recommendations]);

  // 每格通報數（歷史＋本機新增），市民通報分頁用
  const reportCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allReports) counts.set(r.cell, (counts.get(r.cell) ?? 0) + 1);
    return counts;
  }, [allReports]);

  // 施政進度：市府「採納」的是預設指標、只含歷史通報算出的前 30 名，不隨使用者調整而改變
  const progress = useMemo(() => {
    if (!data || !place) return [];
    const base = [...fixedLayers, reportsLayer(data.reportsSeed)];
    const a = aggregate(base);
    return makeProgress(pickRecommendations(computeIndex(a, cellUniverse(a), DEFAULT_INDICATORS)), place.district);
  }, [data, fixedLayers, place]);

  const importLayer = useCallback(({ layer, addIndicator, sign }: ImportOptions) => {
    setCustomLayers((prev) => [...prev, layer]);
    setVisible((v) => ({ ...v, [layer.id]: true }));
    if (addIndicator) {
      setIndicators((prev) => [
        ...prev,
        { id: `i${layer.id}`, label: layer.label, layer: layer.id, method: "count", sign, weight: 0.1, cap: null },
      ]);
    }
  }, []);

  const removeLayer = useCallback((id: string) => {
    setCustomLayers((prev) => prev.filter((l) => l.id !== id));
    setIndicators((prev) => prev.filter((i) => i.layer !== id));
  }, []);

  const selectCell = useCallback(
    (cell: string | null, fly = false) => {
      setSelected(cell);
      if (cell !== null && fly) {
        const [lat, lng] = cellCenter(cell);
        flyTo(lat, lng);
      }
    },
    [flyTo]
  );

  const pickReportLocation = useCallback((lat: number, lng: number) => {
    setDraft({ lat, lng });
    setReportCell(latLngToCell(lat, lng));
  }, []);

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
      setProgressSelected(i);
      flyTo(progress[i].lat, progress[i].lng, 16);
    },
    [progress, flyTo]
  );

  const focusBin = useCallback(
    (i: number) => {
      if (!data) return;
      const [lng, lat] = data.bins.features[i].geometry.coordinates;
      flyTo(lat, lng, 17);
    },
    [data, flyTo]
  );

  const ready = data && place;

  return (
    <div className="app">
      <RoleToggle role={role} onChange={setRole} />
      <MapContainer center={CENTER} zoom={13} className="map" zoomControl>
        <BaseMap />
        <MapPanes />
        <FlyTo target={focus} />
        <CellScale />
        {ready && tab === "recommend" ? (
          <RecommendLayers
            data={data}
            layers={layers}
            cells={cells}
            result={result}
            recommended={recommendedSet}
            selected={selected}
            onSelect={selectCell}
            visible={visible}
            place={place}
          />
        ) : null}
        {ready && tab === "fill" ? (
          <>
            <PoiLayers data={data} layers={fixedLayers} visible={{ mrt: true }} />
            <FillLayers data={data} state={fillState} onPick={focusBin} />
          </>
        ) : null}
        {ready && tab === "reports" ? (
          <>
            <MapClick onClick={pickReportLocation} />
            <ReportLayers data={data} reports={allReports} reportCounts={reportCounts} selected={reportCell} draft={draft} />
          </>
        ) : null}
        {ready && tab === "progress" ? (
          <ProgressLayers data={data} items={progress} district={district} selected={progressSelected} onSelect={selectProgress} />
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
          {ready && tab === "recommend" ? (
            <RecommendPanel
              data={data}
              layers={layers}
              indicators={indicators}
              onIndicators={setIndicators}
              result={result}
              recommendations={recommendations}
              selected={selected}
              onSelect={selectCell}
              visible={visible}
              onVisible={setVisible}
              place={place}
              onRemoveLayer={removeLayer}
              importTool={<ImportLayer onImport={importLayer} storageOk={storageOk} />}
            />
          ) : null}
          {ready && tab === "fill" ? (
            <FillPanel data={data} state={fillState} onChange={setFillState} onFocusBin={focusBin} />
          ) : null}
          {ready && tab === "reports" ? (
            <ReportPanel
              data={data}
              place={place}
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
                setReportCell(latLngToCell(lat, lng));
              }}
            />
          ) : null}
          {ready && tab === "progress" ? (
            <ProgressPanel
              data={data}
              items={progress}
              place={place}
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
