import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ReportPage } from "./ReportPage";
import "./report.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReportPage />
  </StrictMode>
);
