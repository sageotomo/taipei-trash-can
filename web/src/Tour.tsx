import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TabId } from "./App";
import { CELL_WIDTH_M } from "./lib/hexgrid";

// 格子大小從 hexgrid.ts 算，改了格子大小導覽文字會跟著變
const CELL_M = Math.round(CELL_WIDTH_M / 10) * 10;
const CELL_WALK_MIN = Math.max(1, Math.round(CELL_WIDTH_M / 80));

/**
 * 新手導覽：一步一步把畫面上的區塊框起來（其他地方變暗），旁邊跳出說明泡泡。
 * 每一步用 data-tour="…" 找目標元素；目標在別的分頁就先切過去。
 * 找不到目標（例如資料還沒載入）時，泡泡改放在畫面正中央。
 */
export type TourStep = {
  tab?: TabId;
  target: string;
  title: string;
  body: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    tab: "fill",
    target: "tabs",
    title: "三個功能分頁",
    body: "動態調度看即時滿桶與派工、佈建分析找出哪裡該增設垃圾桶、通報案件彙整市民回報。",
  },
  {
    tab: "fill",
    target: "fill-summary",
    title: "即時滿桶狀況",
    body: "試辦區每個垃圾桶的感測器回報裝了幾 %，這裡統計有空位、半滿、需清運各有幾桶。",
  },
  {
    tab: "fill",
    target: "dispatch",
    title: "需出動分隊",
    body: "清潔分隊轄內有 3 桶以上達 90%，就會列在這裡並建議派工。點一隊，地圖會帶你過去。",
  },
  {
    tab: "fill",
    target: "map",
    title: "地圖",
    body: "垃圾桶圖示的顏色代表填滿程度。點任一個垃圾桶，看它的詳細狀況。",
  },
  {
    tab: "recommend",
    target: "tab-recommend",
    title: "接下來：佈建分析模型",
    body: "看完即時調度，現在進入「佈建分析模型」：把台北切成六角形網格，疊加人流、站點與通報資料，找出下一階段最該增設垃圾桶的地方。",
  },
  {
    tab: "recommend",
    target: "map",
    title: "怎麼看這張地圖",
    body: `每個六角形寬約 ${CELL_M} 公尺（走路約 ${CELL_WALK_MIN} 分鐘）。顏色由淺到深是還夠用、有點缺、缺、很缺，沒上色的格子是不缺。外框加粗的格子是建議增設的前 30 名。滑鼠移到格子上看缺桶指數，點一下看它為什麼缺。`,
  },
  {
    tab: "recommend",
    target: "icon-toggles",
    title: "顯示 icon",
    body: "想知道某一格附近有什麼，就在這裡打開 捷運站、YouBike、公車站、現有垃圾桶等圖層。這裡只控制地圖上要不要顯示，不會改變缺桶指數的計算。",
  },
  {
    tab: "recommend",
    target: "indicators",
    title: "調整指標與權重",
    body: "每個情境可以開關、拖動權重。地圖上的六角形網格會立刻重算，顏色越深越缺垃圾桶。",
  },
  {
    tab: "recommend",
    target: "import-csv",
    title: "匯入 CSV，新增參數",
    body: "手上有其他資料，例如公共廁所、觀光景點？按這裡匯入 CSV（每列一個地點，要有緯度、經度，可先下載範本）。匯入後會變成新圖層，也可以直接加成一個指標，選擇它會增加或減少垃圾桶需求，地圖會跟著重算。檔案只在瀏覽器裡讀，不會上傳。",
  },
  {
    tab: "recommend",
    target: "ranking",
    title: "建議增設排行",
    body: "依缺桶指數排出最該增設的位置。點一筆，看這一格的分數是怎麼算出來的。",
  },
  {
    tab: "reports",
    target: "reports",
    title: "通報案件",
    body: "市民掃垃圾桶上的 QR Code 回報問題，案件會即時出現在這張表；標「掃碼」的是新進案件。",
  },
  {
    target: "tour-replay",
    title: "隨時重看導覽",
    body: "想再看一次這段說明，按這裡就好。開始探索吧！",
  },
];

const BUBBLE_W = 300;
const GAP = 14; // 泡泡和目標之間的距離
const EDGE = 12; // 泡泡離視窗邊緣至少多遠
const PAD = 6; // 框比目標大一點
const LAYOUT_SETTLE_MS = 260; // 比 .app 的 grid-template-columns transition（0.2 秒）稍長

type Rect = { top: number; left: number; width: number; height: number };
type Side = "left" | "right" | "top" | "bottom" | "inside";

function findTarget(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
}

/** 目標的位置（裁到視窗內，太長的區塊只框看得到的部分） */
function measure(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  const top = Math.max(r.top - PAD, EDGE / 2);
  const left = Math.max(r.left - PAD, EDGE / 2);
  const bottom = Math.min(r.bottom + PAD, window.innerHeight - EDGE / 2);
  const right = Math.min(r.right + PAD, window.innerWidth - EDGE / 2);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** 泡泡放哪一側：依序試左、右、下、上，都放不下就疊在目標裡面 */
function place(t: Rect, h: number): { side: Side; top: number; left: number; arrow: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(BUBBLE_W, vw - 2 * EDGE);
  const clampY = (y: number) => Math.max(EDGE, Math.min(y, vh - h - EDGE));
  const clampX = (x: number) => Math.max(EDGE, Math.min(x, vw - w - EDGE));
  const midY = t.top + t.height / 2;
  const midX = t.left + t.width / 2;

  if (t.left - GAP - w >= EDGE) {
    const top = clampY(midY - h / 2);
    return { side: "left", top, left: t.left - GAP - w, arrow: midY - top };
  }
  if (t.left + t.width + GAP + w <= vw - EDGE) {
    const top = clampY(midY - h / 2);
    return { side: "right", top, left: t.left + t.width + GAP, arrow: midY - top };
  }
  if (t.top + t.height + GAP + h <= vh - EDGE) {
    const left = clampX(midX - w / 2);
    return { side: "bottom", top: t.top + t.height + GAP, left, arrow: midX - left };
  }
  if (t.top - GAP - h >= EDGE) {
    const left = clampX(midX - w / 2);
    return { side: "top", top: t.top - GAP - h, left, arrow: midX - left };
  }
  return { side: "inside", top: clampY(t.top + t.height - h - EDGE), left: clampX(midX - w / 2), arrow: 0 };
}

export function Tour({ open, onClose, onTab }: { open: boolean; onClose: () => void; onTab: (tab: TabId) => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [bubbleH, setBubbleH] = useState(160);
  const bubble = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const s = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // 換步驟：先切分頁，等畫面更新後把目標捲進畫面。
  // 切分頁時側邊欄寬度有 0.2 秒的動畫（.app 的 transition），動畫結束後再捲一次，免得捲到半路的位置。
  useEffect(() => {
    if (!open) return;
    if (s.tab) onTab(s.tab);
    setRect(null);
    const reveal = () => {
      const el = findTarget(s.target);
      if (!el) return;
      const tall = el.getBoundingClientRect().height > window.innerHeight * 0.7;
      el.scrollIntoView({ block: tall ? "start" : "center", inline: "nearest" });
    };
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(reveal);
    });
    const settle = window.setTimeout(reveal, LAYOUT_SETTLE_MS);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(settle);
    };
  }, [open, step, s, onTab]);

  // 每一幀量一次目標位置：版面動畫、捲動、縮放視窗、資料載入後版面變動，框都會跟著目標走。
  // 位置沒變就不更新 state，不會造成多餘的重繪。
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let prev = "";
    const track = () => {
      const el = findTarget(s.target);
      const r = el ? measure(el) : null;
      const key = r ? `${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.width)},${Math.round(r.height)}` : "none";
      if (key !== prev) {
        prev = key;
        setRect(r);
      }
      raf = requestAnimationFrame(track);
    };
    raf = requestAnimationFrame(track);
    return () => cancelAnimationFrame(raf);
  }, [open, s]);

  useLayoutEffect(() => {
    if (bubble.current) setBubbleH(bubble.current.offsetHeight);
  }, [open, step, rect]);

  useEffect(() => {
    if (open) nextBtn.current?.focus({ preventScroll: true });
  }, [open, step]);

  const next = useCallback(() => (last ? onClose() : setStep((k) => k + 1)), [last, onClose]);
  const prev = useCallback(() => setStep((k) => Math.max(0, k - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev, onClose]);

  if (!open) return null;

  const pos = rect ? place(rect, bubbleH) : null;
  const width = Math.min(BUBBLE_W, window.innerWidth - 2 * EDGE);

  return (
    <div className="tour-layer" role="presentation">
      {/* 擋住底下的點擊；有目標時由框的陰影把其他地方壓暗 */}
      <div className={rect ? "tour-blocker" : "tour-blocker dim"} />
      {rect ? (
        <div
          className="tour-spot"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-hidden="true"
        />
      ) : null}
      <div
        ref={bubble}
        className={`tour-bubble side-${pos?.side ?? "center"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        style={
          pos
            ? { top: pos.top, left: pos.left, width }
            : { top: "50%", left: "50%", width, transform: "translate(-50%, -50%)" }
        }
      >
        {pos && pos.side !== "inside" ? (
          <span
            className="tour-arrow"
            aria-hidden="true"
            style={
              pos.side === "left" || pos.side === "right"
                ? { top: Math.max(18, Math.min(pos.arrow, bubbleH - 18)) }
                : { left: Math.max(18, Math.min(pos.arrow, width - 18)) }
            }
          />
        ) : null}
        <div className="tour-head">
          <span className="tour-count">
            {step + 1} / {TOUR_STEPS.length}
          </span>
          <button className="tour-skip" onClick={onClose}>
            略過導覽
          </button>
        </div>
        <h2 id="tour-title" className="tour-title">
          {s.title}
        </h2>
        <p id="tour-body" className="tour-body">
          {s.body}
        </p>
        <div className="tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((_, k) => (
            <span key={k} className={k === step ? "on" : k < step ? "done" : ""} />
          ))}
        </div>
        <div className="tour-actions">
          {step > 0 ? (
            <button className="button" onClick={prev}>
              上一步
            </button>
          ) : null}
          <button ref={nextBtn} className="button primary" onClick={next}>
            {last ? "開始使用" : "下一步"}
          </button>
        </div>
      </div>
    </div>
  );
}
