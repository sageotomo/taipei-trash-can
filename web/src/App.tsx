import { useCallback, useMemo, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { useAppData } from "./data";
import { computeScores, DEFAULT_WEIGHTS, pickRecommendations } from "./lib/score";
import { hexCenter } from "./lib/hex";
import { FlyTo, MapPanes } from "./map/layers";
import { DEFAULT_LAYERS, RecommendLayers, RecommendPanel, type LayerVisibility } from "./tabs/Recommend";
import type { Weights } from "./types";

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

  const flyTo = useCallback((lat: number, lng: number, zoom = 16) => {
    setFocus({ lat, lng, zoom, key: Date.now() });
  }, []);

  // 每格通報數（之後市民通報分頁會加上本機新增的通報）
  const reportCounts = useMemo(() => {
    if (!data) return [];
    const index = new Map(data.grid.map((c, i) => [c.h3, i]));
    const counts = new Array<number>(data.grid.length).fill(0);
    for (const r of data.reportsSeed) {
      const i = index.get(r.h3);
      if (i !== undefined) counts[i]++;
    }
    return counts;
  }, [data]);

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
          {data && tab !== "recommend" ? <p className="muted">這個分頁還在開發中。</p> : null}
        </section>
      </aside>
    </div>
  );
}
