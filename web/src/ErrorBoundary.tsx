import { Component, type ReactNode } from "react";

/** 程式出錯時顯示說明與重新整理按鈕，而不是一片空白 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>發生錯誤，畫面無法顯示</h1>
        <p>重新整理通常就能解決。如果一直發生，請把下面的訊息提供給開發者。</p>
        <pre>{this.state.error.message}</pre>
        <button className="button primary" onClick={() => location.replace(location.pathname + "?v=" + Date.now())}>
          重新整理
        </button>
      </div>
    );
  }
}
