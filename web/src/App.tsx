import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // ---- 一進網站先跳體驗行前提醒（畫面正中央），按「進入決策平台」或 × 關閉 ----
  const [introOpen, setIntroOpen] = useState(true);
  useEffect(() => {
    if (!introOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIntroOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [introOpen]);

  // ---- 行前提醒關掉 0.5 秒後跳出即時提醒：列出此刻所有需要出動的分隊（lib/dispatch.ts） ----
  // hidden → shown（行前提醒關閉 0.5 秒後）→ viewed（按過地圖查看）→ 按確認派工後關閉回 hidden
  const [demoAlert, setDemoAlert] = useState<"hidden" | "shown" | "viewed">("hidden");
  // 通知內容固定在跳出的那一刻，之後整點換資料也不會改字
  const [dispatchAtLoad, setDispatchAtLoad] = useState<SquadDispatch[]>([]);
  const alertFired = useRef(false);
  useEffect(() => {
    if (!data || introOpen || alertFired.current) return;
    const id = window.setTimeout(() => {
      alertFired.current = true;
      const hour = liveTime.hour;
      const list = squadDispatch(data.bins, binSquads(data.bins), pilotBinIndices(data.bins), (i) => data.fill.levels.B[i][hour]);
      setDispatchAtLoad(list);
      if (list.length) setDemoAlert("shown");
    }, 500);
    return () => window.clearTimeout(id);
    // 資料載入完成且行前提醒關閉後只跳一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, introOpen]);
  // 按地圖查看後通知不關掉，按鈕換成「確認派工」
  const openDemoAlert = () => {
    setDemoAlert("viewed");
    setTab("fill");
    const members = dispatchAtLoad.flatMap((d) => d.members);
    if (!data || !members.length) return;
    const pts = members.map((i) => data.bins.features[i].geometry.coordinates);
    const lats = pts.map((p) => p[1]);
    const lngs = pts.map((p) => p[0]);
    // 只有一個分隊就拉近看；跨分隊就退遠一點，把所有需清運的桶都框進來
    const spread = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
    const zoom = spread < 0.004 ? 17 : spread < 0.012 ? 15 : spread < 0.03 ? 14 : 13;
    flyTo((Math.max(...lats) + Math.min(...lats)) / 2, (Math.max(...lngs) + Math.min(...lngs)) / 2, zoom);
    setFillState((st) => ({ ...st, selected: members[0] }));
  };

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

      {introOpen ? (
        <div className="intro-backdrop" onClick={() => setIntroOpen(false)}>
          <div
            className="intro-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intro-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="alert-toast-close intro-close" aria-label="關閉" onClick={() => setIntroOpen(false)}>
              ×
            </button>
            <p className="intro-kicker">體驗行前提醒：時空連線中......</p>
            <h2 id="intro-title" className="intro-title">歡迎來到 2027 年 4 月的台北市！</h2>
            <p>
              您目前正參與「找回消失的垃圾桶」專案第一階段試辦。過去一個月，我們已在大安區與中山區的既有清潔箱上裝設感測器，並正式啟用您眼前的這套「桶桶沒問題」數據決策平台。
            </p>
            <p>在接下來的系統 Demo 中，您將親自體驗以下核心運作：</p>
            <ul className="intro-list">
              <li>
                <strong>滿桶告警與動態調度：</strong>
                您將看到系統如何即時監控感測器回傳的水位。當單點滿溢即會觸發警示，若該區累積達三處滿桶，系統將自動跳出告警，並建議指派機動小組前往清運，徹底取代傳統無效的盲目巡迴。
              </li>
              <li>
                <strong>六角形網格佈建分析：</strong>
                您將操作圖資介面，看系統如何疊加捷運人流、YouBike 站點與 1999 陳情熱點，以此客觀評估下一階段「哪裡該裁撤、哪裡該增設一般或智慧清潔箱」。
              </li>
              <li>
                <strong>公私協力通報機制：</strong>
                您也可以模擬第一線市民，體驗未來掃描清潔箱 QR Code 即時回報現場狀況的流程，協助補足系統盲區。
              </li>
            </ul>
            <p>準備好體驗數據驅動的市容升級了嗎？請點擊下方按鈕，正式進入決策平台！</p>
            <div className="intro-actions">
              <button className="button primary" autoFocus onClick={() => setIntroOpen(false)}>
                進入決策平台
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {demoAlert !== "hidden" ? (
        <div className="alert-toasts demo" role="alert">
          <div className="alert-toast demo-toast">
            <button className="alert-toast-close" aria-label="關閉通知" onClick={() => setDemoAlert("hidden")}>
              ×
            </button>
            <p className="demo-title">即時提醒</p>
            <p className="demo-message">{dispatchMessage(dispatchAtLoad)}</p>
            <div className="demo-actions">
              {demoAlert === "shown" ? (
                <button className="button primary" onClick={openDemoAlert}>
                  地圖查看
                </button>
              ) : (
                <button className="button primary" onClick={() => setDemoAlert("hidden")}>
                  確認派工
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
