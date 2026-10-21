// 地圖左下角的「顯示 icon」小框：每個圖層一行（圖示、名稱、開關），控制地圖上要不要標出那類地點。
// 只影響地圖顯示，不影響缺桶程度的計算。市民和政府單位視角共用。

import { useEffect, useId, useRef, useState } from "react";
import L from "leaflet";
import type { DataLayer } from "../lib/indicators";
import { Switch } from "../ui";
import { PoiIcon } from "./icons";

// 餐飲店數量太多、也不是生活情境的參數，不放在這裡
const HIDDEN = new Set(["food"]);

export function IconToggles({ layers, visible, onVisible }: {
  layers: DataLayer[];
  visible: Record<string, boolean>;
  onVisible: (v: Record<string, boolean>) => void;
}) {
  // 放在地圖容器裡，點開關時不要被當成點地圖、也不要捲動地圖
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);

  // 預設打開；點標題旁的箭頭可以收起，只留標題列，讓出地圖空間
  const [open, setOpen] = useState(true);
  const listId = useId();

  return (
    <div ref={ref} className={open ? "icon-toggles" : "icon-toggles collapsed"} role="group" aria-label="在地圖上顯示的 icon">
      <button type="button" className="icon-toggles-title" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        <span>顯示 icon</span>
        <svg className="icon-toggles-arrow" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="sr-only">{open ? "收起" : "展開"}</span>
      </button>
      <div id={listId} className="icon-toggles-list" hidden={!open}>
        {layers
          .filter((l) => !HIDDEN.has(l.id))
          .map((l) => {
            const on = !!visible[l.id];
            return (
              <label key={l.id} className={on ? "icon-toggle-row on" : "icon-toggle-row"}>
                <PoiIcon icon={l.icon} size={16} />
                <span className="icon-toggle-name">{l.label}</span>
                <Switch on={on} onChange={(v) => onVisible({ ...visible, [l.id]: v })} label={`在地圖上顯示${l.label}`} />
              </label>
            );
          })}
      </div>
    </div>
  );
}
