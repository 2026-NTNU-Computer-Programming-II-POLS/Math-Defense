# 開發優先項目

> 2026-04-07 全專案分析後確定的三大最值得投入方向，依優先序排列。

---

## 優先 1：前後端整合 + Session 生命週期打通

**目標：** 讓遊戲能跑完整閉環「登入 → 打一局 → 存分數 → 排行榜」。

**現況：**
`sessionService`、`leaderboardService` 均已實作，後端 API 100% 可用，但 `GameView` 的 `LEVEL_END` / `GAME_OVER` 事件沒有接到後端，分數不存、排行榜顯示假資料。

**具體工作：**
- `useGameLoop` 或 `GameView` 監聽 `GAME_START` → `sessionService.createSession()`
- 每波結束 → `sessionService.updateSession()` 同步分數
- `GAME_OVER` / `LEVEL_END` → `sessionService.endSession()` + `leaderboardService.submitScore()`
- `LeaderboardView` 接上真實 API

---

## 優先 2：特殊塔互動 UI

**目標：** 讓「數學即機制」的核心論點真正體現，而非停在 placeholder。

**現況：**
FunctionCannon、RadarSweep 的 BuildPanel 可用；MatrixLink、IntegralCannon、FourierShield（Boss）的數學輸入 UI 尚未實作，WASM 函式已就緒只差介面。

**具體工作：**
- `MatrixInputPanel.vue`：2×2 矩陣輸入 → `WasmBridge.matrixMultiply()`
- `IntegralPanel.vue`：[a,b] 區間輸入/滑桿 → `WasmBridge.numericalIntegrate()`，視覺化積分區域
- `FourierPanel.vue`：波形合成 canvas + 振幅/頻率調整 → `WasmBridge.fourierComposite()` / `fourierMatch()`（Boss 戰 mini-game）
- 以上面板接入 `BuildPanel` 的條件渲染邏輯

---

## 優先 3：前端測試基礎建設 + WASM 編譯整合

**目標：** 建立安全網，讓後續開發速度不因怕壞東西而變慢。

**現況：**
前端 52 個 TS 檔、5 個 System、複雜 FSM——零測試。後端 pytest 8/8 通過，前端完全裸奔。`frontend/public/wasm/` 目錄空白，WASM 未編譯（靠 JS fallback 運作）。

**具體工作：**
- 加入 Vitest（Vite 原生，零配置）
- 為 5 個 System 寫單元測試（純邏輯，不依賴 DOM）
- 為 `PhaseStateMachine` 寫狀態轉換測試
- 為 `WasmBridge` 寫測試（驗證 JS fallback 與 WASM 輸出一致）
- `package.json` 加 `"prebuild": "cd ../wasm && make"` 整合 WASM 編譯
- 可選：GitHub Actions CI（`vue-tsc` + `vitest` + `pytest`）
