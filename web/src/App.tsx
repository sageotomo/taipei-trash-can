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
import { cellCenter, latLngToCell } from "./lib/hexgrid";
import { FlyTo, InvalidateSize, MapClick, MapPanes } from "./map/layers";
import { CellScale } from "./map/CellScale";
import {
  addLocalReport,
  clearLocalReports,
  createReport,
  loadLocalReports,
  localDate,
  removeLocalReport,
  type ReportInput,
} from "./lib/reports";
import { buildCases, loadStatusOverrides, saveStatusOverrides, type CaseStatus, type StatusOverrides } from "./lib/cases";
import { ReportLayers, ReportMapHint, ReportPanel, type Draft } from "./tabs/Reports";
import { ReportGovPanel } from "./tabs/ReportsGov";
import { ProgressLayers, ProgressPanel } from "./tabs/Progress";
import { DEFAULT_VISIBILITY, PoiLayers, RecommendLayers, RecommendPanel, type Visibility } from "./tabs/Recommend";
import { DEFAULT_FILL_STATE, FillLayers, FillPanel, type FillState } from "./tabs/FillLevel";
import { useLiveTime } from "./lib/live";
import { ImportLayer, type ImportOptions } from "./tabs/ImportLayer";
import { IconToggles } from "./map/IconToggles";
import type { Report } from "./types";
import { useQrReports } from "./lib/qrFeed";
import { loadRole, saveRole, type Role } from "./lib/role";
import { RoleToggle } from "./ui";

export type TabId = "recommend" | "fill" | "reports" | "progress";

const TABS: { id: TabId; label: string }[] = [
  { id: "recommend", label: "缺桶程度" },
  { id: "fill", label: "滿桶狀況" },
  { id: "reports", label: "市民通報" },
  { id: "progress", label: "增桶進度" },
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
  const allReports = useMemo(() => [...(data?.reportsSeed ?? []), ...qrReports, ...localReports], [data, qrReports, localReports]);
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

  // 通報案件（處理進度、承辦、最近的垃圾桶），市民看自己通報的進度、政府單位看全部
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

  const pickReportLocation = useCallback((lat: number, lng: number) => {
    setDraft({ lat, lng });
    setReportCell(latLngToCell(lat, lng));
  }, []);

  const submitReport = useCallback(
    (input: ReportInput) => {
      if (!draft) return false;
      const { reports, saved } = addLocalReport(localReports, createReport({ ...input, ...draft }));
      setLocalReports(reports);
      setDraft(null);
      return saved;
    },
    [draft, localReports]
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

  // 切換身分時清掉進行中的通報草稿與選取
  useEffect(() => {
    setDraft(null);
    setSelectedReport(null);
  }, [role]);

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

  const ready = data && place;
  // 政府單位看填滿度與通報案件時，右側要放整張表格，面板加寬
  const wide = (tab === "fill" || tab === "reports") && role === "gov";

  return (
    <div className={wide ? "app wide" : "app"}>
      <RoleToggle role={role} onChange={setRole} />
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
              role={role}
            />
          ) : null}
          {ready && tab === "recommend" ? <IconToggles layers={layers} visible={visible} onVisible={setVisible} /> : null}
          {ready && tab === "fill" ? (
            <>
              <PoiLayers data={data} layers={fixedLayers} visible={{ mrt: true }} />
              <FillLayers
                data={data}
                time={liveTime}
                role={role}
                state={fillState}
                onPickBin={pickFillBin}
                onPickLocation={(location) => setFillState((s) => ({ ...s, location }))}
              />
            </>
          ) : null}
          {ready && tab === "reports" ? (
            <>
              {role === "citizen" ? (
                <>
                  <MapClick onClick={pickReportLocation} />
                  <ReportMapHint draft={draft} />
                </>
              ) : null}
              <ReportLayers
                data={data}
                reports={allReports}
                reportCounts={reportCounts}
                selected={reportCell}
                draft={draft}
                role={role}
                cases={caseById}
                selectedId={role === "gov" ? selectedReport : null}
                onPickReport={role === "gov" ? (id) => pickCase(id, false) : undefined}
              />
            </>
          ) : null}
          {ready && tab === "progress" ? (
            <ProgressLayers data={data} items={progress} district={district} selected={progressSelected} onSelect={selectProgress} />
          ) : null}
        </MapContainer>
      </div>

      <aside id="side-panel" className="panel">
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
              role={role}
              importTool={<ImportLayer onImport={importLayer} storageOk={storageOk} />}
            />
          ) : null}
          {ready && tab === "fill" ? (
            <FillPanel
              data={data}
              time={liveTime}
              role={role}
              state={fillState}
              onChange={setFillState}
              onFocusBin={focusBin}
              onFocus={flyTo}
            />
          ) : null}
          {ready && tab === "reports" && role === "gov" ? (
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
          {ready && tab === "reports" && role === "citizen" ? (
            <ReportPanel
              data={data}
              place={place}
              reports={allReports}
              localReports={localReports}
              reportCounts={reportCounts}
              selected={reportCell}
              draft={draft}
              cases={caseById}
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
    </div>
  );
}
