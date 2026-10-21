// 檢舉照片：在瀏覽器裡縮小、轉成 JPEG，再以 data URL 存進 localStorage。
// 手機拍的照片動輒 3–5 MB，縮到長邊 800 px、品質 0.7 約 60–120 KB。

export const MAX_SIDE = 800;
export const QUALITY = 0.7;
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/** 縮放後的尺寸：長邊不超過 max，不放大 */
export function fitSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("請選擇照片檔。");
  if (file.size > MAX_INPUT_BYTES) throw new Error("照片太大（超過 20 MB）。");
  // imageOrientation: 依照片的 EXIF 方向轉正（手機直拍的照片才不會躺著）
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { w, h } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("這個瀏覽器無法處理照片。");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", QUALITY);
}
