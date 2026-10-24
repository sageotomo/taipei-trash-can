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
import { WEEKS, makeProgressHistory } from "./lib/progress";
import { loadCustomLayers, loadIndicators, saveCustomLayers, saveIndicators } from "./lib/storage";
import { cellCenter } from "./lib/hexgrid";
import { FlyTo, InvalidateSize, MapPanes } from "./map/layers";
import { CellScale } from "./map/CellScale";
import { localDate } from "./lib/reports";
import { buildCases, loadStatusOverrides, saveStatusOverrides, type CaseStatus, type StatusOverrides } from "./lib/cases";
import { ReportLayers } from "./tabs/Reports";
import { ReportGovPanel } from "./tabs/ReportsGov";
import { ProgressLayers, ProgressPanel } from "./tabs/Progress";
import { DEFAULT_VISIBILITY, RecommendLayers, RecommendPanel, type Visibility } from "./tabs/Recommend";
import { DEFAULT_FILL_STATE, FillLayers, FillPanel, type FillState } from "./tabs/FillLevel";
import { useLiveTime } from "./lib/live";
import { ImportLayer, type ImportOptions } from "./tabs/ImportLayer";
import { IconToggles } from "./map/IconToggles";
import { useQrReports } from "./lib/qrFeed";
import { binSquads, dispatchMessage, squadDispatch, type SquadDispatch } from "./lib/dispatch";
import { pilotBinIndices } from "./lib/pilot";

export type TabId = "recommend" | "fill" | "reports" | "progress";

const TABS: { id: TabId; label: string }[] = [
  { id: "fill", label: "動態調度" },
  { id: "recommend", label: "佈建分析" },
  { id: "reports", label: "通報案件" },
  { id: "progress", label: "數據統計" },
];

// 台北市中心
const CENTER: [number, number] = [25.045, 121.535];

export type Focus = { lat: number; lng: number; zoom?: number; key: number } | null;

export default function App() {
  const { data, error } = useAppData();
  const [tab, setTab] = useState<TabId>("fill");
  const [indicators, setIndicators] = useState<Indicator[]>(loadIndicators);
  const [selected, setSelected] = useState<string | null>(null);
  const [visible, setVisible] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [focus, setFocus] = useState<Focus>(null);
  const [reportCell, setReportCell] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<StatusOverrides>(loadStatusOverrides);
  useEffect(() => saveStatusOverrides(statusOverrides), [statusOverrides]);
  const [district, setDistrict] = useState("全部");
  const [progressSelected, setProgressSelected] = useState<number | null>(null);
  // 增桶進度看哪一週，預設最新一週
  const [progressWeek, setProgressWeek] = useState(WEEKS.length - 1);
  const [fillState, setFillState] = useState<FillState>(DEFAULT_FILL_STATE);
  // 右側面板可收起，讓地圖佔滿整個畫面
  const liveTime = useLiveTime();

  const [customLayers, setCustomLayers] = useState<DataLayer[]>(loadCustomLayers);
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => saveIndicators(indicators), [indicators]);
  useEffect(() => setStorageOk(saveCustomLayers(customLayers)), [customLayers]);

  const flyTo = useCallback((lat: number, lng: number, zoom = 16) => {
    setFocus({ lat, lng, zoom, key: Date.now() });
  }, []);

  const qrReports = useQrReports(data?.bins);
  const allReports = useMemo(() => [...(data?.reportsSeed ?? []), ...qrReports], [data, qrReports]);
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

  // 每格通報數（歷史＋QR code 新進），通報案件分頁用
  const reportCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allReports) counts.set(r.cell, (counts.get(r.cell) ?? 0) + 1);
    return counts;
  }, [allReports]);

  // 通報案件（處理進度、承辦、最近的垃圾桶）
  const binPoints = useMemo(
    () =>
      data
        ? data.bins.features.map((f) => ({ id: f.properties.id, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }))
        : [],
    [data]
  );
  const cases = useMemo(
    () => (place ? buildCases(allReports, statusOverrides, binPoints, place.district, localDate()) : []),
    [allReports, statusOverrides, binPoints, place]
  );
  const caseById = useMemo(() => new Map(cases.map((c) => [c.report.id, c])), [cases]);

  // 增桶進度：每週一用「截至上週日的歷史通報」、預設指標重算前 30 名，不隨使用者調整而改變
  const progressHistory = useMemo(() => {
    if (!data || !place) return [];
    const rankings = WEEKS.map((w) => {
      const base = [...fixedLayers, reportsLayer(data.reportsSeed.filter((r) => r.created_at < w.cutoff))];
      const a = aggregate(base);
      return pickRecommendations(computeIndex(a, cellUniverse(a), DEFAULT_INDICATORS));
    });
    return makeProgressHistory(rankings, place.district);
  }, [data, fixedLayers, place]);
  const progress = useMemo(() => progressHistory[progressWeek]?.items ?? [], [progressHistory, progressWeek]);

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

  const pickCase = useCallback(
    (id: string, fly = true) => {
      const c = caseById.get(id);
      if (!c) return;
      setSelectedReport(id);
      setReportCell(c.report.cell);
      if (fly) flyTo(c.report.lat, c.report.lng, 17);
    },
    [caseById, flyTo]
  );

  const setCaseStatus = useCallback((id: string, status: CaseStatus) => {
    setStatusOverrides((prev) => ({ ...prev, [id]: { status, updated_at: localDate() } }));
  }, []);

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

  const pickFillBin = useCallback(
    (i: number) => {
      setFillState((s) => ({ ...s, selected: i }));
      focusBin(i);
    },
    [focusBin]
  );

  // ---- 載入 1 秒後跳出即時提醒：列出此刻所有需要出動的分隊（lib/dispatch.ts） ----
  // hidden → shown（載入 1 秒後）→ 按確認派工或 × 後關閉回 hidden
  const [demoAlert, setDemoAlert] = useState<"hidden" | "shown">("hidden");
  // 通知內容固定在跳出的那一刻，之後整點換資料也不會改字
  const [dispatchAtLoad, setDispatchAtLoad] = useState<SquadDispatch[]>([]);
  useEffect(() => {
    if (!data) return;
    const id = window.setTimeout(() => {
      const hour = liveTime.hour;
      const list = squadDispatch(data.bins, binSquads(data.bins), pilotBinIndices(data.bins), (i) => data.fill.levels.B[i][hour]);
      setDispatchAtLoad(list);
      if (list.length) setDemoAlert("shown");
    }, 1000);
    return () => window.clearTimeout(id);
    // 只在資料載入完成時跳一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const ready = data && place;
  // 動態調度與通報案件右側要放整張表格，面板加寬
  const wide = tab === "fill" || tab === "reports";

  return (
    <div className={wide ? "app wide" : "app"}>
      {/* 地圖放在內縮的框裡，外圍用側邊欄的底色 */}
      <div className="map-frame">
        <MapContainer center={CENTER} zoom={13} className="map" zoomControl>
          <BaseMap />
          <MapPanes />
          <FlyTo target={focus} />
          <CellScale />
          <InvalidateSize dep={String(wide)} />
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
          {ready && tab === "recommend" ? <IconToggles layers={layers} visible={visible} onVisible={setVisible} /> : null}
          {ready && tab === "fill" ? (
            <FillLayers
              data={data}
              time={liveTime}
              state={fillState}
              onPickBin={pickFillBin}
            />
          ) : null}
          {ready && tab === "reports" ? (
            <ReportLayers
              data={data}
              reports={allReports}
              reportCounts={reportCounts}
              selected={reportCell}
              cases={caseById}
              selectedId={selectedReport}
              onPickReport={(id) => pickCase(id, false)}
            />
          ) : null}
          {ready && tab === "progress" ? (
            <ProgressLayers data={data} items={progress} district={district} selected={progressSelected} onSelect={selectProgress} />
          ) : null}
        </MapContainer>
      </div>

      <aside id="side-panel" className="panel">
        <header className="panel-header">
          <h1 className="brand">
            <img src="./brand/logo.png" alt="桶桶沒問題！" width="640" height="199" />
          </h1>
          <div className="brand-topic">找回消失的垃圾桶</div>
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
            <FillPanel
              data={data}
              time={liveTime}
              state={fillState}
              onChange={setFillState}
              onFocusBin={focusBin}
              onFocus={flyTo}
            />
          ) : null}
          {ready && tab === "reports" ? (
            <ReportGovPanel
              data={data}
              place={place}
              cases={cases}
              reportCounts={reportCounts}
              selectedId={selectedReport}
              onSelect={pickCase}
              onStatus={setCaseStatus}
            />
          ) : null}
          {ready && tab === "progress" ? (
            <ProgressPanel
              data={data}
              history={progressHistory}
              week={progressWeek}
              onWeek={(w) => {
                setProgressWeek(w);
                setProgressSelected(null);
              }}
              place={place}
              district={district}
              onDistrict={setDistrict}
              selected={progressSelected}
              onSelect={selectProgress}
            />
          ) : null}
        </section>
      </aside>

      {demoAlert !== "hidden" ? (
        <div className="alert-toasts demo" role="alert">
          <div className="alert-toast demo-toast">
            <button className="alert-toast-close" aria-label="關閉通知" onClick={() => setDemoAlert("hidden")}>
              ×
            </button>
            <p className="demo-title">即時提醒</p>
            <p className="demo-message">
              {dispatchMessage(dispatchAtLoad)}
              <span className="demo-note">(此為模擬通知，實際情況會通知訊息到各個分隊的裝置)</span>
            </p>
            <div className="demo-actions">
              <button className="button primary" onClick={() => setDemoAlert("hidden")}>
                確認派工
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
