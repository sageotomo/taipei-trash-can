// 只有一個 QR code 的空白頁（qr.html）。QR code 指向同一個網站的 /report，
// 所以正式網址和分支預覽各自產生對的連結，不用改程式。
import QRCode from "qrcode";

const target = new URL("report", location.href).href;
QRCode.toString(target, { type: "svg", errorCorrectionLevel: "M", margin: 2 }).then((svg) => {
  document.getElementById("qr")!.innerHTML = svg;
});
