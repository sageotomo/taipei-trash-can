import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type L from "leaflet";
import { HexLayer, PointLayer, PANES } from "../map/layers";
import type { Placer } from "../lib/place";
import { ACTIONS, CATEGORIES, HIGH_REPORTS, OCCURRED_MAX_DAYS, localDateTime, occurredError, shortDateTime, suggestAction, type Category, type ReportInput } from "../lib/reports";
import { CASE_COLORS, validContact, type ReportCase } from "../lib/cases";
import { compressPhoto } from "../lib/photo";
import type { Role } from "../lib/role";
import { Section, SourceTag, Swatch, escapeHtml, fmt } from "../ui";
import type { AppData } from "../data";
import type { Report } from "../types";

export const CATEGORY_COLORS: Record<string, string> = {
  亂丟垃圾: "#d1495b",
  垃圾桶滿溢: "#e3b23c",
  家戶垃圾棄置: "#7b4fa0",
};

const HOT_COLORS = ["#f6d5d0", "#eda59b", "#d9614f", "#9e2a1d"];
function hotClass(count: number): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  if (count === 2) return 1;
  if (count < 5) return 2;
  return 3;
}

export interface Draft {
  lat: number;
  lng: number;
}

/**
 * 地圖上方的操作提示（市民）。第一次來的人常常不知道要點地圖，所以直接寫在地圖上。
 * pointer-events: none，點到提示也等於點地圖。
 */
export function ReportMapHint({ draft }: { draft: Draft | null }) {
  return (
    <div className={draft ? "map-hint picked" : "map-hint"} role="status">
      <span className="map-hint-icon" aria-hidden="true" />
      {draft ? "已標好位置，接著填通報表單。點錯了？再點一次就能換" : "點一下地圖，標出你看到垃圾問題的位置"}
    </div>
  );
}

const STEPS = [
  { title: "在地圖上點位置", text: "放大到你看到問題的路口或街道，點一下。" },
  { title: "選類別、填發生時間", text: "發生時間必填；照片和說明選填，有照片比較好判斷。" },
  { title: "送出、追蹤進度", text: "留 email 或手機，處理完會通知你。" },
];

/** 三步驟進度：還沒點地圖在第 1 步、填表中在第 2 步、送出後在第 3 步 */
function ReportSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="steps" aria-label="怎麼通報">
      {STEPS.map((step, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={step.title} className={`step step-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="step-num" aria-hidden="true">
              {state === "done" ? "✓" : n}
            </span>
            <span className="step-body">
              <b>{step.title}</b>
              <small>{step.text}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 地圖上的記號說明 */
function MapKey() {
  return (
    <ul className="map-key">
      <li>
        <Swatch color="#2e6b4f" />
        現有垃圾桶
      </li>
      <li>
        <span className="key-dot key-draft" aria-hidden="true" />
        你正在標的位置
      </li>
      <li>
        <span className="key-dot key-mine" aria-hidden="true" />
        你送出的通報
      </li>
      {CATEGORIES.map((c) => (
        <li key={c}>
          <Swatch color={CATEGORY_COLORS[c]} />
          其他人通報的{c}
        </li>
      ))}
      <li>
        <Swatch color={HOT_COLORS[2]} shape="hex" />
        六角格越紅，這一帶通報越多
      </li>
    </ul>
  );
}

/** 每格的垃圾桶數與「現行固定排程下一週平均滿溢小時數」 */
export function useBinStats(data: AppData) {
  return useMemo(() => {
    const stats = new Map<string, { bins: number; overflowSum: number }>();
    data.bins.features.forEach((f, i) => {
      const s = stats.get(f.properties.cell) ?? { bins: 0, overflowSum: 0 };
      s.bins += 1;
      s.overflowSum += data.fill.overflow.A[i];
      stats.set(f.properties.cell, s);
    });
    return stats;
  }, [data]);
}

// ---------------- 地圖 ----------------

interface LayersProps {
  data: AppData;
  reports: Report[];
  reportCounts: Map<string, number>;
  selected: string | null;
  draft: Draft | null;
  role: Role;
  cases: Map<string, ReportCase>;
  selectedId: string | null;
  onPickReport?: (id: string) => void;
}

export function ReportLayers({ data, reports, reportCounts, selected, draft, role, cases, selectedId, onPickReport }: LayersProps) {
  // 政府單位：點的顏色改成處理進度
  const colorOf = useCallback(
    (r: Report) => {
      if (role === "gov") {
        const c = cases.get(r.id);
        if (c) return CASE_COLORS[c.status];
      }
      return CATEGORY_COLORS[r.category] ?? "#d1495b";
    },
    [role, cases]
  );
  // 有通報的格子＋目前選的格子
  const cells = useMemo(() => {
    const set = new Set(reportCounts.keys());
    if (selected) set.add(selected);
    return [...set].sort();
  }, [reportCounts, selected]);

  const hexStyle = useCallback(
    (i: number): L.PathOptions => {
      const k = hotClass(reportCounts.get(cells[i]) ?? 0);
      const isSelected = cells[i] === selected;
      return {
        fillColor: k < 0 ? "#ffffff" : HOT_COLORS[k],
        fillOpacity: k < 0 ? 0.04 : 0.4,
        color: isSelected ? "#1b2a2f" : "#ffffff",
        weight: isSelected ? 3 : 0.5,
        opacity: isSelected ? 1 : 0.5,
      };
    },
    [cells, reportCounts, selected]
  );
  const tooltip = useCallback((i: number) => `通報 ${reportCounts.get(cells[i]) ?? 0} 件`, [cells, reportCounts]);

  const bins = useMemo(
    () => data.bins.features.map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] })),
    [data.bins]
  );
  const binStyle = useCallback(
    (): L.CircleMarkerOptions => ({ radius: 3.5, fillColor: "#2e6b4f", color: "#ffffff", weight: 1, fillOpacity: 1 }),
    []
  );

  const reportStyle = useCallback(
    (i: number): L.CircleMarkerOptions => {
      const r = reports[i];
      const fillColor = colorOf(r);
      if (r.id === selectedId) return { radius: 9, fillColor, color: "#1b2a2f", weight: 3, fillOpacity: 1 };
      if (role === "gov") {
        // 已結案的淡掉，讓還沒處理的案件跳出來
        return cases.get(r.id)?.status === "已結案"
          ? { radius: 3, fillColor, color: "#ffffff", weight: 0.5, fillOpacity: 0.5, opacity: 0.5 }
          : { radius: 5, fillColor, color: "#ffffff", weight: 1.2, fillOpacity: 1 };
      }
      return r.local
        ? { radius: 7, fillColor, color: "#1b2a2f", weight: 2, fillOpacity: 1 }
        : { radius: 3.5, fillColor, color: "#ffffff", weight: 0.8, fillOpacity: 0.9 };
    },
    [reports, colorOf, role, selectedId, cases]
  );
  const reportTip = useCallback(
    (i: number) => {
      const r = reports[i];
      const c = role === "gov" ? cases.get(r.id) : undefined;
      const when = r.occurred_at ? `發生 ${shortDateTime(r.occurred_at)}` : r.created_at;
      const head = c ? `${escapeHtml(r.id)}・${r.category}・${c.status}${c.overdue ? "（逾期）" : ""}` : `${r.category}・${when}`;
      return `${head}${r.note ? `<br>${escapeHtml(r.note)}` : ""}`;
    },
    [reports, role, cases]
  );
  const pickReport = useCallback((i: number) => onPickReport?.(reports[i].id), [onPickReport, reports]);
  // 點的提示與點擊只在建立時綁定，所以身分或處理進度變了就重建這一層
  const pointsKey = useMemo(
    () => (role === "gov" ? `gov:${reports.map((r) => cases.get(r.id)?.status ?? "").join(",")}` : "citizen"),
    [role, reports, cases]
  );

  const draftPoints = useMemo(() => (draft ? [draft] : []), [draft]);
  const draftStyle = useCallback(
    (): L.CircleMarkerOptions => ({ radius: 10, fillColor: "#ffffff", color: "#1b2a2f", weight: 3, fillOpacity: 0.9, dashArray: "3 3" }),
    []
  );

  return (
    <>
      <HexLayer cells={cells} style={hexStyle} tooltip={tooltip} />
      <PointLayer points={bins} style={binStyle} />
      <PointLayer
        key={pointsKey}
        points={reports}
        style={reportStyle}
        tooltip={reportTip}
        pane={PANES.top}
        onClick={onPickReport ? pickReport : undefined}
      />
      <PointLayer points={draftPoints} style={draftStyle} pane={PANES.top} />
    </>
  );
}

// ---------------- 面板 ----------------

interface PanelProps {
  data: AppData;
  place: Placer;
  reports: Report[];
  localReports: Report[];
  reportCounts: Map<string, number>;
  selected: string | null;
  draft: Draft | null;
  cases: Map<string, ReportCase>;
  /** 回傳是否存成功 */
  onSubmit: (input: ReportInput) => boolean;
  onCancel: () => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onFocus: (lat: number, lng: number) => void;
}

export function ReportPanel(props: PanelProps) {
  const { data, place, reports, localReports, reportCounts, selected, draft } = props;
  const [category, setCategory] = useState<Category>("亂丟垃圾");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [occurredTouched, setOccurredTouched] = useState(false);
  const occurredMsg = occurredError(occurredAt);
  const occurredInput = useRef<HTMLInputElement>(null);
  const [contact, setContact] = useState("");
  const [contactTouched, setContactTouched] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [sent, setSent] = useState<{ contact: boolean; saved: boolean } | null>(null);
  const contactOk = validContact(contact);
  const binStats = useBinStats(data);
  // 點地圖後把表單捲進畫面：手機版的表單在地圖下方，不捲過去常常沒發現
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (draft && window.matchMedia("(max-width: 800px)").matches) {
      formRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [draft]);

  const byCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reports) counts[r.category] = (counts[r.category] ?? 0) + 1;
    return counts;
  }, [reports]);

  const advice = useMemo(() => {
    if (selected === null) return null;
    const s = binStats.get(selected);
    const bins = s?.bins ?? 0;
    const avgOverflow = s && s.bins > 0 ? s.overflowSum / s.bins : 0;
    const count = reportCounts.get(selected) ?? 0;
    return { count, bins, avgOverflow, action: suggestAction(count, bins, avgOverflow) };
  }, [selected, binStats, reportCounts]);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoMsg(null);
    try {
      setPhoto(await compressPhoto(file));
    } catch (e) {
      setPhotoMsg(e instanceof Error && e.message ? e.message : "照片讀不到，換一張試試。");
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const submit = () => {
    if (occurredMsg || !contactOk) {
      setOccurredTouched(true);
      setContactTouched(true);
      // 跳到第一個有問題的欄位，錯誤說明才不會在畫面外
      if (occurredMsg) occurredInput.current?.focus();
      return;
    }
    const saved = props.onSubmit({ category, occurredAt, note, photo: photo ?? undefined, contact });
    setSent({ contact: contact.trim() !== "", saved });
    setNote("");
    setOccurredAt("");
    setOccurredTouched(false);
    setPhoto(null);
    setPhotoMsg(null);
    setContactTouched(false);
    // 聯絡方式保留，下次通報不用再打
  };

  // 剛送出的那筆（清單最後一筆）的編號
  const lastId = localReports.length > 0 ? localReports[localReports.length - 1].id : "";

  return (
    <>
      <p className="lead">看到亂丟垃圾、垃圾桶滿出來？三個步驟告訴承辦單位，不用登入。</p>

      <ReportSteps current={draft ? 2 : sent ? 3 : 1} />

      {draft ? (
        <div className="detail" ref={formRef}>
          <div className="detail-head">
            <div>
              <div className="form-title">新增通報</div>
              <div className="muted">{place([draft.lat, draft.lng])}</div>
            </div>
            <button className="icon-button" onClick={props.onCancel} aria-label="取消">
              ×
            </button>
          </div>
          <fieldset className="chips">
            <legend className="sr-only">類別</legend>
            {CATEGORIES.map((c) => (
              <label key={c} className={category === c ? "chip active" : "chip"}>
                <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} />
                <Swatch color={CATEGORY_COLORS[c]} />
                {c}
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="report-occurred">
              發生時間 <span className="required">必填</span>
            </label>
            <div className="occurred-row">
              <input
                ref={occurredInput}
                id="report-occurred"
                type="datetime-local"
                value={occurredAt}
                max={localDateTime()}
                min={localDateTime(new Date(Date.now() - OCCURRED_MAX_DAYS * 86_400_000))}
                required
                onChange={(e) => setOccurredAt(e.target.value)}
                onBlur={() => setOccurredTouched(true)}
                aria-invalid={occurredTouched && occurredMsg !== null}
                aria-describedby="occurred-help"
              />
              <button
                type="button"
                className="button"
                onClick={() => {
                  setOccurredAt(localDateTime());
                  setOccurredTouched(true);
                }}
              >
                就是現在
              </button>
            </div>
            <small id="occurred-help" className={occurredTouched && occurredMsg ? "field-help warn-text" : "field-help"}>
              {occurredTouched && occurredMsg
                ? occurredMsg
                : "你看到問題的日期和大約時間。承辦單位會用來判斷是不是固定時段發生，例如晚上收攤後。"}
            </small>
          </div>
          <div className="field">
            <span>現場照片（選填）</span>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              id="report-photo"
              onChange={(e) => void pickPhoto(e.target.files?.[0])}
            />
            {photo ? (
              <div className="photo-preview">
                <img src={photo} alt="要上傳的檢舉照片" />
                <div className="photo-actions">
                  <label htmlFor="report-photo" className="link-button">
                    換一張
                  </label>
                  <button type="button" className="link-button" onClick={() => setPhoto(null)}>
                    移除
                  </button>
                </div>
              </div>
            ) : (
              <label htmlFor="report-photo" className={photoBusy ? "photo-drop busy" : "photo-drop"}>
                <span className="photo-icon" aria-hidden="true" />
                {photoBusy ? "處理照片中…" : "拍照或選一張照片"}
                <small>有照片的通報，承辦單位比較好判斷要派誰去</small>
              </label>
            )}
            {photoMsg ? <p className="footnote warn-text">{photoMsg}</p> : null}
          </div>
          <label className="field">
            <span>說明（選填）</span>
            <textarea
              rows={2}
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：公車站旁常有人丟飲料杯"
            />
          </label>
          <label className="field">
            <span>Email 或手機（選填，追蹤處理進度用）</span>
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              maxLength={100}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              onBlur={() => setContactTouched(true)}
              placeholder="例如：0912345678 或 name@example.com"
              aria-invalid={contactTouched && !contactOk}
              aria-describedby="contact-help"
            />
            <small id="contact-help" className={contactTouched && !contactOk ? "field-help warn-text" : "field-help"}>
              {contactTouched && !contactOk
                ? "格式看起來不對：請填 email、手機（09 開頭 10 碼）或市話。"
                : "只給承辦單位聯絡你，政府端畫面會遮蔽部分號碼，也不會出現在匯出檔。"}
            </small>
          </label>
          <div className="form-actions">
            <button className="button" onClick={props.onCancel}>
              取消
            </button>
            <button className="button primary" onClick={submit} disabled={photoBusy}>
              送出通報
            </button>
          </div>
        </div>
      ) : sent ? (
        <div className="hint-box sent-box">
          <strong>已送出，通報編號 {lastId}</strong>
          <span>
            地圖上有黑框的點就是你的通報。處理進度會顯示在下方「你送出的通報」
            {sent.contact ? "，進度更新時也會通知你（示意）" : ""}。
          </span>
          <span className="muted">還有別的地方要通報？直接再點地圖就可以。</span>
          {!sent.saved ? (
            <span className="warn-text">這台瀏覽器的儲存空間滿了，這筆通報重新整理後會消失。可以刪掉幾筆有照片的舊通報。</span>
          ) : null}
        </div>
      ) : (
        <div className="hint-box start-box">
          <strong>從地圖開始</strong>
          <span>
            點一下地圖上有垃圾問題的位置，這裡就會出現通報表單。找不到地方？先用滑鼠滾輪或兩指放大地圖。
          </span>
        </div>
      )}

      {advice ? (
        <div className={`advice advice-${advice.action}`}>
          <div className="advice-label">這一格的處置建議</div>
          <div className="advice-action">{ACTIONS[advice.action].label}</div>
          <p>{ACTIONS[advice.action].why}</p>
          <dl className="supply">
            <div>
              <dt>通報</dt>
              <dd>{advice.count} 件</dd>
            </div>
            <div>
              <dt>垃圾桶</dt>
              <dd>{advice.bins} 個</dd>
            </div>
            <div>
              <dt>每桶一週滿溢</dt>
              <dd>{advice.bins > 0 ? `${fmt(advice.avgOverflow, 1)} 小時` : "—"}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <details className="guide" open={!draft && localReports.length === 0}>
        <summary>地圖上的記號</summary>
        <MapKey />
      </details>

      <details className="guide">
        <summary>常見問題</summary>
        <dl className="faq">
          <dt>要登入或下載 App 嗎？</dt>
          <dd>不用。打開網頁就能通報，email 和手機也都是選填。</dd>
          <dt>該選哪個類別？</dt>
          <dd>
            路邊、公車站有人亂丟選「亂丟垃圾」；垃圾桶塞滿、垃圾掉到地上選「垃圾桶滿溢」；整袋家裡的垃圾被丟在路邊或垃圾桶旁選「家戶垃圾棄置」。
          </dd>
          <dt>為什麼要填發生時間？</dt>
          <dd>垃圾問題常集中在固定時段，例如夜市收攤後或清運前。知道時間，承辦單位才知道該什麼時候去巡、要不要加開清運。</dd>
          <dt>我的照片和聯絡方式誰看得到？</dt>
          <dd>只有承辦單位。其他市民在地圖上只看得到類別和說明。</dd>
          <dt>通報存在哪裡？</dt>
          <dd>這個示範版存在你這台裝置的瀏覽器，換手機或清除瀏覽資料就會不見。</dd>
        </dl>
      </details>

      <Section title="通報統計" aside={<SourceTag source={data.sources.find((s) => s.key === "reports")} />}>
        <ul className="layer-list">
          {CATEGORIES.map((c) => (
            <li key={c} className="stat-row">
              <span>
                <Swatch color={CATEGORY_COLORS[c]} />
                {c}
              </span>
              <span className="num">{fmt(byCategory[c] ?? 0)} 件</span>
            </li>
          ))}
        </ul>
        <div className="legend">
          <span>通報少</span>
          {HOT_COLORS.map((c) => (
            <Swatch key={c} color={c} shape="hex" />
          ))}
          <span>多（{HIGH_REPORTS} 件以上算高）</span>
        </div>
      </Section>

      <Section
        title={`你送出的通報（${localReports.length}）`}
        aside={
          localReports.length > 0 ? (
            <button className="link-button" onClick={props.onClear}>
              全部清除
            </button>
          ) : null
        }
      >
        {localReports.length === 0 ? (
          <p className="muted">還沒有。</p>
        ) : (
          <ul className="rank-list">
            {[...localReports].reverse().map((r) => {
              const c = props.cases.get(r.id);
              return (
              <li key={r.id} className="report-row">
                <button className="rank-item" onClick={() => props.onFocus(r.lat, r.lng)}>
                  {r.photo ? <img className="report-thumb" src={r.photo} alt="" /> : <Swatch color={CATEGORY_COLORS[r.category]} />}
                  <span className="rank-main">
                    {r.category}
                    <small>
                      {r.id}・{r.occurred_at ? `發生 ${shortDateTime(r.occurred_at)}` : r.created_at.slice(5).replace("-", "/")}
                      {r.note ? `・${r.note}` : ""}
                    </small>
                  </span>
                  {c ? (
                    <span className="case-status" title={`最後更新 ${c.updated_at}`}>
                      <Swatch color={CASE_COLORS[c.status]} />
                      {c.status}
                    </span>
                  ) : null}
                </button>
                <button className="link-button" onClick={() => props.onDelete(r.id)} aria-label={`刪除這筆${r.category}通報`}>
                  刪除
                </button>
              </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
