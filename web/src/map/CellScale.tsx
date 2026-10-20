// 地圖左下角的小標示：一格六角形實際有多大。
// 數字直接從 hexgrid.ts 的常數算，改了格子大小這裡會跟著變。

import { useEffect, useRef } from "react";
import L from "leaflet";
import { CELL_AREA_KM2, CELL_HEIGHT_M, CELL_WIDTH_M } from "../lib/hexgrid";
import { fmt } from "../ui";

const WALK_M_PER_MIN = 80; // 一般步行速度約每分鐘 80 公尺

/** 取整到 10 公尺 */
const round10 = (m: number) => Math.round(m / 10) * 10;

export function CellScale() {
  // 放在地圖容器裡，點它時不要被當成點地圖（市民通報分頁點地圖會新增通報）
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);
  const width = round10(CELL_WIDTH_M);
  const minutes = Math.max(1, Math.round(CELL_WIDTH_M / WALK_M_PER_MIN));
  const detail =
    `正六角形，尖頂朝北。平邊到平邊約 ${fmt(width)} 公尺、頂點到頂點 ${fmt(round10(CELL_HEIGHT_M))} 公尺，` +
    `面積約 ${fmt(CELL_AREA_KM2, 2)} 平方公里。步行以每分鐘 ${WALK_M_PER_MIN} 公尺估算。`;

  return (
    <div ref={ref} className="cell-scale" title={detail}>
      <svg viewBox="0 0 20 22" width="14" height="15" aria-hidden="true">
        <polygon points="10,1 19,6 19,16 10,21 1,16 1,6" />
      </svg>
      <span>
        每格寬約 <b>{fmt(width)} 公尺</b>
        <span className="muted">・走路約 {minutes} 分鐘</span>
      </span>
      <span className="sr-only">{detail}</span>
    </div>
  );
}
