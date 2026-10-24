import { useState } from "react";
import { CUSTOM_COLORS, CUSTOM_GLYPHS, GLYPHS, PoiIcon } from "../map/icons";
import { MAX_BYTES, TEMPLATE_CSV, buildPoints, makeCustomLayer, readCsv, type Columns, type ParsedCsv } from "../lib/csv";
import type { DataLayer } from "../lib/indicators";
import { SignToggle } from "./Recommend";
import { fmt } from "../ui";

export interface ImportOptions {
  layer: DataLayer;
  addIndicator: boolean;
  sign: 1 | -1;
}

const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + TEMPLATE_CSV)}`;

/** 匯入 CSV 成為新圖層。檔案只在瀏覽器裡讀，不會上傳 */
export function ImportLayer({ onImport, storageOk, imported = [], onClear }: {
  onImport: (o: ImportOptions) => void;
  storageOk: boolean;
  /** 目前匯入的圖層名稱；有的話才顯示「清除匯入資料」 */
  imported?: string[];
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [cols, setCols] = useState<Columns>({ lat: -1, lng: -1, name: -1 });
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("個");
  const [glyph, setGlyph] = useState(CUSTOM_GLYPHS[0]);
  const [color, setColor] = useState(CUSTOM_COLORS[0]);
  const [addIndicator, setAddIndicator] = useState(true);
  const [sign, setSign] = useState<1 | -1>(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = () => {
    setParsed(null);
    setError(null);
    setOpen(false);
  };

  const readFile = async (file: File) => {
    setError(null);
    setNotice(null);
    if (file.size > MAX_BYTES) {
      setError("檔案超過 10 MB，請先篩選再匯入。");
      return;
    }
    try {
      const p = readCsv(await file.text());
      setParsed(p);
      setCols(p.columns);
      setLabel(file.name.replace(/\.[^.]+$/, "").slice(0, 30));
    } catch (e) {
      setParsed(null);
      setError((e as Error).message);
    }
  };

  const submit = () => {
    if (!parsed) return;
    try {
      const built = buildPoints(parsed, cols);
      const layer = makeCustomLayer({ label, unit, icon: { glyph, color }, built });
      onImport({ layer, addIndicator, sign });
      const skipped = [
        built.skipped.outside ? `${fmt(built.skipped.outside)} 筆不在台北市` : "",
        built.skipped.invalid ? `${fmt(built.skipped.invalid)} 筆沒有座標` : "",
      ].filter(Boolean);
      setNotice(
        `已匯入「${layer.label}」${fmt(built.points.length)} ${layer.unit}` +
          (skipped.length ? `，略過 ${skipped.join("、")}` : "") +
          (built.swapped ? "。經緯度欄位寫反了，已自動對調" : "") +
          (built.fields.length ? `。可加總的數值欄位：${built.fields.map((f) => f.label).join("、")}` : "") +
          "。"
      );
      reset();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const columnSelect = (key: keyof Columns, title: string, optional = false) => (
    <label className="field-inline">
      <span>{title}</span>
      <select value={cols[key]} onChange={(e) => setCols({ ...cols, [key]: Number(e.target.value) })}>
        <option value={-1}>{optional ? "（沒有）" : "請選擇"}</option>
        {parsed!.headers.map((h, j) => (
          <option key={j} value={j}>
            {h || `第 ${j + 1} 欄`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="import">
      {notice ? <p className="hint-box">{notice}</p> : null}
      {!storageOk ? <p className="hint-box">匯入的資料太大，瀏覽器存不下；重新整理後需要重新匯入。</p> : null}

      {!open ? (
        <button className="button add-button" onClick={() => setOpen(true)}>
          ＋ 匯入新資料（CSV），例如公共廁所
        </button>
      ) : null}
      {!open && imported.length > 0 && onClear ? (
        <button
          className="link-button danger clear-import"
          onClick={() => {
            if (!window.confirm(`要清除匯入的「${imported.join("、")}」嗎？用到它們的指標也會一起刪掉。`)) return;
            onClear();
            setNotice(null);
          }}
        >
          清除匯入資料（{imported.length}）
        </button>
      ) : null}
      {!open ? null : (
        <div className="detail add-form">
          <div className="detail-head">
            <div className="form-title">匯入新資料</div>
            <button className="icon-button" onClick={reset} aria-label="取消匯入">
              ×
            </button>
          </div>
          <p className="footnote">
            每一列是一個地點，要有緯度、經度欄位（WGS84）。檔案只在你的瀏覽器裡讀取，不會上傳。
            <a href={templateHref} download="匯入範本.csv">
              下載範本
            </a>
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="選擇 CSV 檔"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
            }}
          />
          {error ? <p className="error">{error}</p> : null}

          {parsed ? (
            <>
              <p className="muted small">讀到 {fmt(parsed.rows.length)} 列。請確認欄位：</p>
              {columnSelect("lat", "緯度")}
              {columnSelect("lng", "經度")}
              {columnSelect("name", "名稱", true)}
              <label className="field-inline">
                <span>圖層名稱</span>
                <input type="text" value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} placeholder="例如：公共廁所" />
              </label>
              <label className="field-inline">
                <span>單位</span>
                <input type="text" value={unit} maxLength={4} onChange={(e) => setUnit(e.target.value)} className="short" />
              </label>
              <fieldset className="field-inline picker">
                <legend>圖示</legend>
                {CUSTOM_GLYPHS.map((g) => (
                  <label key={g} className={g === glyph ? "pick active" : "pick"} title={GLYPHS[g].label}>
                    <input type="radio" name="glyph" value={g} checked={g === glyph} onChange={() => setGlyph(g)} className="sr-only" />
                    <PoiIcon icon={{ glyph: g, color }} size={24} />
                  </label>
                ))}
              </fieldset>
              <fieldset className="field-inline picker">
                <legend>顏色</legend>
                {CUSTOM_COLORS.map((c) => (
                  <label key={c} className={c === color ? "pick active" : "pick"}>
                    <input type="radio" name="color" value={c} checked={c === color} onChange={() => setColor(c)} className="sr-only" />
                    <span className="color-dot" style={{ background: c }} aria-label={c} />
                  </label>
                ))}
              </fieldset>
              <label className="check">
                <input type="checkbox" checked={addIndicator} onChange={(e) => setAddIndicator(e.target.checked)} />
                同時新增指標「格內有幾{unit || "個"}」，權重 0.10
              </label>
              {addIndicator ? (
                <div className="field-inline">
                  <span>方向</span>
                  <SignToggle sign={sign} onChange={setSign} />
                </div>
              ) : null}
              <div className="form-actions">
                <button className="button" onClick={reset}>
                  取消
                </button>
                <button className="button primary" onClick={submit} disabled={cols.lat < 0 || cols.lng < 0}>
                  匯入
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
