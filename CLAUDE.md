# 給 Claude 的專案規則

## 修改程式的流程（一定要照做）

任何修改（程式、設定、文件）都不能直接推到 `main`。推上 `main` 會觸發 Cloudflare 正式部署。

1. **開分支**：先更新到最新的 `main`，再開新分支，例如 `feat/…`、`fix/…`、`docs/…`。所有 commit 都放在分支上。
2. **推分支，給預覽網址**：推上 GitHub 後，等 Cloudflare 的 `Workers Builds: taipei-trash-can` 檢查成功，再把預覽網址給使用者：
   `https://<分支名稱，斜線換成 ->-taipei-trash-can.sage-otomo.workers.dev`
   例如 `feat/rename-terms` → `https://feat-rename-terms-taipei-trash-can.sage-otomo.workers.dev`。
   可以用 `gh api repos/sageotomo/taipei-trash-can/commits/<sha>/check-runs` 查 build 結果。build 失敗要先修好，不能叫使用者看壞掉的預覽。
3. **等使用者確認**：使用者看過預覽、明確說 OK 之前，不能 merge。
4. **Merge 到 `main`**：一個功能一個 commit，commit 訊息清楚。只用來重新觸發 build 的空 commit 不要帶進 `main`（用 cherry-pick 或 rebase 拿掉）。推上 `main` 後確認正式部署成功。
5. **刪掉分支**：merge 後把 GitHub 上和本機的這個分支都刪掉。

## 其他

- 測試：`cd web && npm test`；build：`cd web && npm run build`。推之前兩個都要通過。
- 分支預覽需要 `web/wrangler.jsonc` 裡的 `"previews": {}` 區塊，不要刪掉。部署細節見 README 的「部署」段落。
- 回覆使用者一律用繁體中文。
