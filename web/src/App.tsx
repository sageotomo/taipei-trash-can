import { useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";

export type TabId = "recommend" | "fill" | "reports" | "progress";

const TABS: { id: TabId; label: string }[] = [
  { id: "recommend", label: "增設建議" },
  { id: "fill", label: "填滿模擬" },
  { id: "reports", label: "市民通報" },
  { id: "progress", label: "施政進度" },
];

// 台北市中心
const CENTER: [number, number] = [25.045, 121.535];

export default function App() {
  const [tab, setTab] = useState<TabId>("recommend");

  return (
    <div className="app">
      <MapContainer center={CENTER} zoom={13} preferCanvas className="map">
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />
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
          <p className="muted">資料載入中。</p>
        </section>
      </aside>
    </div>
  );
}
