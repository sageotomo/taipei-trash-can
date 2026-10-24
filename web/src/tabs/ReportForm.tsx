// 市民通報表單：儀表板「市民通報」分頁（點地圖後）和掃 QR code 的通報頁（report.html）共用同一份。
// 送出成功後清空表單；onSubmit 丟出錯誤時保留內容並顯示錯誤。

import { useRef, useState } from "react";
import { CATEGORIES, OCCURRED_MAX_DAYS, localDateTime, occurredError, type Category, type ReportInput } from "../lib/reports";
import { compressPhoto } from "../lib/photo";
import { Swatch } from "../ui";
import { CATEGORY_COLORS } from "./reportColors";

export function ReportForm(props: { onSubmit: (input: ReportInput) => void | Promise<void>; onCancel?: () => void }) {
  const [category, setCategory] = useState<Category>("亂丟垃圾");
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [occurredTouched, setOccurredTouched] = useState(false);
  const occurredMsg = occurredError(occurredAt);
  const occurredInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  const submit = async () => {
    if (sending) return;
    if (occurredMsg) {
      setOccurredTouched(true);
      // 跳到有問題的欄位，錯誤說明才不會在畫面外
      occurredInput.current?.focus();
      return;
    }
    setSending(true);
    setSubmitError(null);
    try {
      await props.onSubmit({ category, occurredAt, note, photo: photo ?? undefined });
    } catch (e) {
      // 送出失敗：保留填好的內容，讓市民可以再按一次
      setSubmitError(e instanceof Error && e.message ? e.message : "送出失敗，請稍後再試。");
      return;
    } finally {
      setSending(false);
    }
    setNote("");
    setOccurredAt("");
    setOccurredTouched(false);
    setPhoto(null);
    setPhotoMsg(null);
  };

  return (
    <>
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
    {submitError ? (
      <p className="footnote warn-text" role="alert">
        {submitError}
      </p>
    ) : null}
    <div className="form-actions">
      {props.onCancel ? (
        <button className="button" onClick={props.onCancel}>
          取消
        </button>
      ) : null}
      <button className="button primary" onClick={() => void submit()} disabled={photoBusy || sending}>
        {sending ? "送出中…" : "送出通報"}
      </button>
    </div>
    </>
  );
}
