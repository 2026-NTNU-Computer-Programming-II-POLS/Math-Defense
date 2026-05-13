# 數學防線 Math Defense — 期末專題企劃書（v3，歷史設計稿）

> **⚠️ 版本歷史說明**：本文件是原始設計稿（v3）。實際實作已演進至 **V2 Phase 5（2026-04-30）**。
> - **V1 設計**（本文件）：6 種塔、5 種敵人、Buff 卡系統、傅立葉護盾
> - **V2 Phase 5 實作**：7 種數學概念塔（Magic/Radar A–C/Matrix/Limit/Calculus）、7 種敵人、時間制 Spell 系統、Monty Hall 事件、成就/天賦樹、排名競賽系統
> 
> 前端詳見 [`frontend/README.md`](frontend/README.md)、後端詳見 [`backend/README.md`](backend/README.md)。
> 核心遊戲理念（「數學即機制」）保持不變，但經濟系統、難度設計、進度機制已大幅重新設計。

## 一、專題概述

| 項目 | 內容 |
|------|------|
| 專題名稱 | 數學防線 Math Defense |
| 課程 | 程式設計（二）期末專題 |
| 團隊 | 三人（大一、大二、大三），本科：教育與科技 |
| 目標玩家 | 高中生 |
| 遊戲類型 | 策略型塔防 × 數學學習 |
| 技術棧 | Vue 3 + TypeScript（前端）、FastAPI（後端，DDD 分層）、HTML5 Canvas、C → WebAssembly（數學運算核心） |
| 開發時程 | 6 週以上 |
| 關卡數量 | 4 關精緻版 |

### 核心理念

**「數學即機制」而非「答題換金幣」。** 數學概念不是用來解鎖獎勵的門檻，而是直接構成遊戲的操作機制。玩家輸入的函數參數決定砲彈軌跡、攻擊範圍、塔的連動方式，數學理解程度直接影響遊戲表現。

### 設計哲學

- **手動輸入，非滑桿操作**：玩家必須手動輸入數學參數（如 m、b、角度），不能透過拖曳滑桿「看著調」。每一次修改都需要從視覺結果反推數值，強迫數學思考。
- **概念名稱與操作同時顯示**：Build Phase 中，數學術語直接標示在操作面板上（如「斜率 slope (m)」、「定積分 ∫」），玩家每次操作都在建立「術語 ↔ 直覺」的連結。
- **允許試錯的安全環境**：Build Phase 內可無限修改參數，波次開始後鎖定。參考 Kapur (2008) Productive Failure 理論——允許失敗，但每次失敗都有學習價值。

---

## V1 → V2 Phase 5 重大變更總結

本節簡述原始設計 (v3) 與最終實作 (Phase 5) 間的進化。詳細請見 [`frontend/README.md`](frontend/README.md#v2-phase-5---progression-system) 與 [`backend/README.md`](backend/README.md)。

| 面向 | V1 設計稿 | V2 Phase 5 實作 |
|------|---------|-----------------|
| **塔系統** | 6 種塔（含 V1 命名） | 7 種數學概念塔（Magic/Radar A–C/Matrix/Limit/Calculus） |
| **敵人系統** | 5 種史萊姆 + Boss 龍 | 7 種敵人（含 Boss Type-A/B，B 有鏈式法則挑戰） |
| **經濟系統** | 全塔攻擊力倍增等固定 Buff 卡 | 時間制 Spell（Fireball/Frost Nova/Lightning/Rejuvenate） + 時間基 Buff |
| **事件系統** | Buff 卡抽籤（3 張選 1 張） | Monty Hall 隨機事件（kill-value 觸發，門後獎勵） |
| **難度系統** | 固定 4 關 | 1–5 星難度動態調整 |
| **進度系統** | — | 20 成就 + 21 節點天賦樹（7 塔類型） + 角色頭像 |
| **競賽系統** | — | Grabbing Territory 活動 + 4 種排行榜（全球/天賦/活動/地域） |
| **計分公式** | 簡單金幣計分 | S1/S2/K/TotalScore 多維公式（殺傷效率 vs 成本效率） |
| **初始答題** | — | Initial Answer（戰前端點辨識，答對加分） |
| **角色系統** | — | 多角色（Admin/Teacher/Student）+ 班級管理 + RBAC |
| **資料庫** | SQLite | PostgreSQL + DDD 分層 + 樂觀鎖（地域佔領） |

本文件後續內容描述 V1 設計的完整細節（供歷史參考），但不影響 V2 Phase 5 的實際遊戲流程與機制。

---

---

## 二、地圖設計：座標平面

遊戲地圖的底層就是一個 **二維直角座標系（x-y 軸）**。

- 塔的位置以座標表示（如放在 (3, 5)）
- 攻擊範圍是座標平面上的數學區域
- 敵人沿著數學函數定義的路徑行進
- 所有敵人的目標是**原點 (0, 0)**——設計為一個發光的魔法陣，敵人靠近會讓魔法陣光芒減弱（扣 HP）
- 整個遊戲畫面就是一張「活的數學圖表」

### 敵人路徑 = 隨機數學函數

每局遊戲開始時，系統從該關卡的「隨機池」中抽取一個函數作為本局的敵人路徑。同一局內所有敵人沿相同路徑行進。

玩家在 Build Phase 會看到敵人路徑的**數學函數表示式**（如 `y = 2sin(x) + 4`），必須在腦中「畫出」這條函數的圖形，才能決定塔的參數。

### 隨機池隨關卡擴大

| 關卡 | 可能出現的函數類型 | 參數範圍（確保路徑經過有效區域且朝向原點） |
|------|-------------------|----------------------------------------|
| Level 1 | y = a（水平線）、y = mx + b（一次函數） | m ∈ [-1, 1]、b ∈ [2, 8] |
| Level 2 | Level 1 全部 + y = ax² + bx + c（二次函數） | 開口方向和頂點隨機，保證經過地圖有效區域 |
| Level 3 | Level 2 全部 + y = A·sin(Bx) + C（三角函數） | 振幅、頻率、位移隨機 |
| Level 4 | Level 3 全部 + 分段函數、複合函數 | Boss 關，最高難度 |

### 隨機路徑的教學意義

- 玩家不可能「背答案」，只能真正理解函數圖形
- 累積排行榜反映「誰真的能即時讀懂函數」，而非「誰背了攻略」
- 每一局都有新鮮感，大幅提升重玩價值
- Report 可論述：隨機化如何促進 transfer learning（遷移學習）

---

## 三、視覺風格

### 整體調性

**中世紀奇幻 × 像素風（Pixel Art）**

- 座標格線 = 刻在石板地面上的「古代符文」，暗金色，存在感中等（看得到但不搶眼）
- 數字刻度 = 符文文字
- 塔 = 像素風魔法塔
- 敵人 = 像素風史萊姆怪物
- 數學 = 這個奇幻世界的「魔法體系」

### 配色方案

| 元素 | 顏色 | 說明 |
|------|------|------|
| 地圖底色 | 深色石板（#1a1520 / #252030 交替） | Dungeon floor 質感 |
| 座標格線 | 暗金色（#3a3028） | 刻在地板上的符文 |
| 座標軸 | 亮金色（#8b7342） | 比格線稍亮 |
| 函數砲 | 藍色系（#4a82c8） | 冰系/水系魔法 |
| 雷達掃描塔 | 綠色系（#4aab6e） | 自然/風系魔法 |
| 矩陣連結塔 | 紫色系（#9068c8） | 祕術/空間魔法 |
| 機率神殿 | 琥珀金色（#c89848） | 命運/占卜系魔法 |
| 敵人 | 紅色系（#b84040） | 魔物經典色 |
| 原點魔法陣 | 發光金色 | 玩家要保衛的目標 |

### Build Phase 輸入面板

- **位置**：點擊塔後彈出浮動面板
- **風格**：深色羊皮紙風格，金色邊框，monospace 字體（像在「抄寫魔法咒語」）
- **按鈕文字**：「Cast Spell」而非「確認」
- **數學術語標示**：每個輸入欄位旁標示概念名稱（如「斜率 slope (m)」）

### HUD（頂部資訊列）

顯示：波次狀態（Build Phase / Wave X）、金幣、HP、累積分數。深色 + 金色主題。

---

## 四、塔的系統（6 種塔）

### 基礎塔（4 種）

#### 1. 函數砲（Function Cannon）

- **魔法屬性**：冰系（藍色）
- **數學概念**：一次函數 y = mx + b，進階升級為二次函數 y = ax² + bx + c
- **解鎖**：Level 1
- **機制**：
  - Build Phase：手動輸入斜率 m 與截距 b
  - 座標平面上即時預覽該直線
  - 確認後，砲彈沿直線路徑飛行
  - 直線與敵人路徑的交點 = 命中點（本質上是「解聯立方程式」）
  - 升級後可輸入 a、b、c，砲彈改為拋物線軌跡
- **學習目標**：斜率改變方向、截距改變位置、拋物線開口方向與頂點

#### 2. 雷達掃描塔（Radar Sweep）

- **魔法屬性**：風系（綠色）
- **數學概念**：三角函數（sin/cos）、角度、扇形
- **解鎖**：Level 2
- **機制**：
  - 設定三個參數：起始角度 θ、掃描弧度寬 Δθ、半徑 r
  - 塔持續掃描該扇形區域，區域內敵人受傷
  - 座標平面上即時預覽扇形覆蓋範圍
- **學習目標**：角度量測、扇形面積、sin/cos 作為 x-y 分量的直覺

#### 3. 矩陣連結塔（Matrix Link）

- **魔法屬性**：祕術系（紫色）
- **數學概念**：2×2 矩陣、線性變換（旋轉、縮放）
- **解鎖**：Level 3
- **機制**：
  - 選擇兩座相鄰的塔，輸入 2×2 矩陣連結
  - 矩陣對兩塔的聯合攻擊向量做線性變換
  - 旋轉矩陣 → 攻擊方向改變（覆蓋死角）
  - 縮放矩陣 → 攻擊範圍放大但傷害密度降低
  - UI 顯示 before/after 攻擊模式預覽
- **學習目標**：矩陣乘法、旋轉/縮放變換的幾何意義

#### 4. 機率神殿（Probability Shrine）

- **魔法屬性**：命運系（琥珀金）
- **數學概念**：期望值、風險管理
- **全關卡可用**
- **機制**：詳見「Buff 卡系統」章節

### 進階塔（2 種）

#### 5. 積分砲（Integral Cannon）

- **數學概念**：定積分 = 面積 = 攻擊範圍
- **解鎖**：Level 3+（作為完整可玩的進階機制）
- **機制**：
  - **操作方式**：混合式——玩家輸入函數（決定曲線形狀）+ 設定積分區間 [a, b]（決定覆蓋範圍）
  - 曲線直接畫在座標平面上，曲線下方的陰影面積 = 攻擊範圍
  - **傷害模式**：面積越大，單位傷害越低（總傷害固定，平均分散於面積內）
  - 策略取捨：
    - 窄而高的曲線 = 窄走廊但集中火力（打直線密集敵群）
    - 寬而矮的曲線 = 大面積但傷害稀薄（打分散敵群）
  - 面板即時顯示面積數值和攻擊區域預覽
  - 數學術語標示：「定積分 ∫[a,b] f(x)dx」、「面積 = 攻擊範圍」
- **學習目標**：理解「積分 = 面積」的具象意義、最佳化問題（覆蓋率 vs 擊殺力的平衡）

#### 6. 傅立葉護盾破解（Fourier Shield Break）

- **數學概念**：傅立葉分解、波的疊加
- **定位**：Level 4 Boss 戰專用機制
- **詳細機制**：見「Boss 戰：傅立葉破盾」章節

---

## 五、敵人系統

### 預設敵人：史萊姆（Slime）

所有敵人統一為史萊姆的不同變體，以像素風呈現。支援玩家上傳自訂圖片替換素材。

#### 五種史萊姆變體

| 名稱 | 像素顏色 | HP | 速度 | 特殊能力 | 出現關卡 |
|------|----------|-----|------|----------|----------|
| 基本史萊姆 | 綠色（8×8 px） | 低 | 中 | 無 | Level 1+ |
| 快速史萊姆 | 藍色（窄型 + 速度線） | 很低 | 2x | 跑太快，點攻擊來不及命中 | Level 2+ |
| 坦克史萊姆 | 紅色（16×16 px） | 3x | 慢 | 單塔難以擊殺，需矩陣連結 | Level 3+ |
| 分裂史萊姆 | 紫色 | 中 | 中 | 路徑中段分裂成兩隻 | Level 3+ |
| 隱身史萊姆 | 半透明白色 | 中 | 中 | 特定 x 區間隱形 | Level 4 |

#### 分裂史萊姆的分裂機制

- 走到路徑中段（約 x 軸中點）時分裂成兩隻小史萊姆
- 一隻繼續原路徑 f(x)
- 另一隻偏移到平行路徑 **y = f(x) + 1**（垂直平移）
- Build Phase 中顯示偏移函數（如 `y = f(x) + 1`）
- **教學意義**：玩家在不知不覺中學習「函數垂直平移」
- 後期可延伸為 y = f(x - 2)（水平平移）、y = 2f(x)（垂直伸縮），教授完整的函數變換知識

#### 隱身史萊姆的隱身機制

- 在特定 x 區間會消失（如 x ∈ [4, 6]）
- Build Phase 中直接標示隱身區間：`x ∈ 4~6`
- 隱身期間所有塔完全打不到
- 玩家需把火力集中在隱身區間前後

#### Boss 龍

- Level 4 最終波出現
- 具有傅立葉護盾（詳見 Boss 戰章節）
- 飛在路徑上方（y 值偏移），普通直線砲射不到，需拋物線砲的弧線
- 高 HP，需要全隊塔配合

### 自訂頭像功能

- 玩家可上傳任意圖片
- 系統自動裁切為 16×16 像素頭像（Canvas `drawImage` 縮放 + `imageSmoothingEnabled = false`）
- 替換所有史萊姆的預設素材
- **Demo 殺手鐧**：讓教授上傳自己的照片，看到被像素化然後被函數砲轟

### 敵人出生與路徑

- 敵人從路徑函數的起始 x 值進入座標平面
- 沿函數路徑向原點 (0, 0) 移動
- 到達原點即扣除玩家 HP
- 不同波次可讓敵人從不同起始 x 值出發，製造時間差和空間壓力

---

## 六、Buff 卡系統（機率神殿）

### 觸發時機

每波結束後、下一波 Build Phase 開始前。

### 基本規則

- 翻開 3 張隨機 Buff 卡
- 每張卡顯示：效果描述、成功機率、消耗金幣
- **成功或失敗**機制（賭博感強）：選了就擲骰，成功生效、失敗白花金幣
- 玩家可以**跳過不選**（但浪費了一次機會）
- 數學術語標示：面板上標示「期望值 = 機率 × 效果」

### 三種正面 Buff

| 類別 | 範例 |
|------|------|
| 塔增強 | 全塔攻擊力 +50%（2 波），成功率 40%，花費 80 金 |
| 塔增強 | 某塔攻擊範圍 +30%（1 波），成功率 70%，花費 50 金 |
| 塔增強 | 函數砲升級為二次函數砲（永久），成功率 25%，花費 150 金 |
| 經濟 | 下一波擊殺金幣翻倍，成功率 60%，花費 40 金 |
| 經濟 | 免費蓋一座新塔，成功率 25%，花費 0 金 |
| 經濟 | 退還上一座塔的建造費用，成功率 80%，花費 20 金 |
| 防禦 | 回復 3 HP，成功率 90%，花費 60 金 |
| 防禦 | 本波護盾（敵人不扣 HP），成功率 50%，花費 100 金 |
| 防禦 | 原點魔法陣爆炸（最後防線），成功率 35%，花費 120 金 |

### 詛咒卡（負面效果換金幣）

| 範例 | 說明 |
|------|------|
| 全塔攻擊力 -20%（1 波），獲得 200 金 | 短期損失換長期資源 |
| 下一波敵人速度 +50%，獲得 150 金 | 增加挑戰但賺錢 |
| 隨機一座塔停機 1 波，獲得 180 金 | 犧牲一座塔的收益 |

### 決策範例

波次結束，三張卡翻開：
- **卡 A**：全塔攻擊力 +50%（2 波）。成功率 40%。花費 80 金。→ 期望值 = 0.4 × 大效果，但六成白花
- **卡 B**：回復 2 HP。成功率 90%。花費 60 金。→ 幾乎穩拿，效果普通
- **卡 C**：全塔攻擊力 -20%（1 波），獲得 200 金。→ 穩賺但短期減弱

玩家要考慮：血量低時選 B 保命？資源足夠時賭 A？缺錢時接受 C 的詛咒？還是三張都不選保留金幣？

### 教學意義

每次選卡 = 一次期望值計算練習。玩家自然開始比較「機率 × 效果 ÷ 成本」，這就是高中機率與統計的核心應用。

---

## 七、Boss 戰：傅立葉破盾

### 觸發時機

Level 4 最終波，Boss 龍出現時遊戲暫停，進入破盾迷你遊戲。

### 機制

1. **Boss 護盾波形**：系統隨機生成一個複雜波形（由 3 個 sin 波疊加而成）
2. **玩家操作**：手動輸入 3 組參數（每組包含頻率和振幅，共 6 個數字）
3. **即時預覽**：畫面上方顯示 Boss 的護盾波形，下方顯示玩家的合成波形，兩者即時對比
4. **匹配度判定**：匹配度決定護盾削弱程度（漸進式），不是全有全無
5. **護盾回復**：護盾會慢慢回復（隱形計時器），拖越久護盾越回滿
6. **多次嘗試**：玩家可反覆調整參數、多次送出
7. **退出迷你遊戲**：滿意時手動退出，或護盾完全回復時自動退出
8. **戰鬥繼續**：退出後遊戲恢復，其他塔趁護盾削弱的空窗攻擊 Boss

### 數學術語標示

面板上標示：「傅立葉分解 Fourier Decomposition」、「f(t) = A₁sin(ω₁t) + A₂sin(ω₂t) + A₃sin(ω₃t)」

### 教學循環

嘗試匹配 → 護盾削弱 → 塔輸出 → 護盾回復 → 再嘗試更好的匹配。每一輪玩家對波形的理解都會加深。

---

## 八、遊戲流程

### 單波流程

```
Build Phase（準備階段）              Wave Phase（戰鬥階段）
┌───────────────────────┐          ┌───────────────────────┐
│ • 看到敵人路徑的數學函數  │          │ • 敵人沿路徑向原點行進    │
│ • 手動輸入塔的數學參數    │          │ • 塔自動攻擊             │
│ • 曲線/範圍預覽（含術語） │  ─────→  │ • 參數已鎖定不可改       │
│ • 可無限次修改            │          │ • 觀察策略效果           │
│ • 確認送出（Cast Spell）  │          │                         │
└───────────────────────┘          └───────────────────────┘
                                            │
                                            ▼
                                   ┌───────────────────────┐
                                   │ Buff 卡選擇            │
                                   │ • 3 張隨機卡（含詛咒）  │
                                   │ • 可跳過                │
                                   │ • 直接進入下一波        │
                                   └───────────────────────┘
```

### 關鍵設計原則

- **數學只在 Build Phase**：不會在戰鬥中跳出數學題目打斷節奏
- **Wave Phase 是純觀賞/驗證**：玩家看到自己的數學策略如何發揮效果
- **無波次結算畫面**：波次結束直接進入 Buff 選擇 → 下一波 Build Phase，保持心流
- **僅關卡結束時總結**：顯示本關總分、擊殺數、累積排行榜排名變化

### Boss 戰特殊流程

正常波次 → Boss 波開始 → Boss 出現 → 暫停 → 傅立葉破盾迷你遊戲 → 退出 → 戰鬥繼續 → Boss 被擊敗或玩家失敗

---

## 九、關卡設計（4 關精緻版）

| 關卡 | 名稱 | 可用塔 | 敵人路徑隨機池 | 敵人種類 | 波數 | 設計重點 |
|------|------|--------|---------------|----------|------|----------|
| 1 | 草原 Grassland | 函數砲 | 水平線、一次函數 | 基本史萊姆 | 3-4 | 教學關，引導 y = mx + b |
| 2 | 峽谷 Canyon | 函數砲 + 雷達塔 | + 二次函數 | + 快速史萊姆 | 4-5 | 三角函數覆蓋 + 拋物線路徑 |
| 3 | 堡壘 Fortress | 全基礎塔 + 積分砲 | + 三角函數 | + 坦克、分裂史萊姆 | 5-6 | 矩陣連結 + 積分砲登場 |
| 4 | 龍巢 Dragon's Lair | 全塔 + 傅立葉 | + 分段、複合函數 | + 隱身史萊姆、Boss 龍 | 6-7 | 綜合所有概念，Boss 戰 |

### 難度設計

- **Level 1**：引導式教學，每個新操作都有 UI 提示，路徑為簡單函數
- **Level 2**：提示減少，引入曲線路徑和快速敵人
- **Level 3**：無提示，需綜合運用多種塔，積分砲作為進階選項
- **Level 4**：最高難度，Boss 戰 + 傅立葉破盾，所有數學概念綜合

---

## 十、排行榜系統

| 項目 | 設計 |
|------|------|
| 儲存方式 | localStorage（單機本機） |
| 排名指標 | 累積總分（鼓勵多玩） |
| 輸入方式 | 玩家輸入暱稱 |
| 同儕促進 | 同一台電腦的玩家互相比較 |
| 隨機化意義 | 每局路徑不同，分數反映真正的數學理解力而非背答案 |

---

## 十一、技術架構

### 架構總覽：三層分離（前端 / 後端 / 運算核心）

```
┌───────────────────────────────────────────────┐        ┌─────────────────────────────┐
│  瀏覽器（前端）                                │        │  伺服器（後端 FastAPI）       │
│                                                │        │                             │
│  Vue 3 + TypeScript：UI、路由、Pinia 狀態       │  HTTPS │  DDD 分層（Domain /         │
│  遊戲引擎（pure TS）：Canvas 渲染、遊戲流程      │ ─────► │   Application /             │
│  ↕ ccall / cwrap                               │  /api  │   Infrastructure）          │
│  WASM 層（C 編譯）：數學運算核心                  │        │  Auth / Session / 排行榜     │
│    • matrix_multiply      矩陣連結塔            │        │  JWT + bcrypt, SQLAlchemy   │
│    • calculate_trajectory 函數砲軌跡            │        └─────────────────────────────┘
│    • sector_coverage      雷達掃描塔            │
│    • numerical_integrate  積分砲                │
│    • fourier_composite    傅立葉破盾            │
└───────────────────────────────────────────────┘
```

C 負責**計算層**，TypeScript 負責**表現層**，FastAPI 負責**持久化與使用者身份**。遊戲中每一次砲彈軌跡計算、面積運算、波形合成，都實際經過 C 編譯的 WASM 模組執行；分數與排行榜則透過後端 REST API 儲存。

> 詳細目錄與 API 規格請見：
> - 前端：[`frontend/README.md`](frontend/README.md)
> - 後端：[`backend/README.md`](backend/README.md)

### 前端：Vue 3 + TypeScript + HTML5 Canvas

| 模組 | 功能 |
|------|------|
| Vue 3 UI 層（`<script setup>` + Pinia） | 選單、登入、Build Phase 面板、HUD、Buff 卡、傅立葉破盾介面 |
| Game Engine（`src/engine/`，純 TS） | 固定步長遊戲迴圈、PhaseStateMachine、EventBus、Canvas 渲染 |
| WASM Bridge | 載入 WASM 模組，封裝 `ccall`/`cwrap`；型別由 `wasm-exports.d.ts` 自動生成 |
| Tower / Wave / Enemy Systems | 6 種塔邏輯、路徑函數生成、分裂/隱身邏輯；數學運算委託 WASM |
| Services（`src/services/`） | `fetch` 封裝，自動附帶 Bearer token；負責 Auth / Session / Leaderboard API |
| Asset Manager | 像素風 sprites、chiptune 音效、自訂頭像上傳處理 |

### 後端：FastAPI（DDD）

| 層 | 功能 |
|------|------|
| Domain | `GameSession` / `LeaderboardEntry` / `User` aggregates、value objects、repository protocols |
| Application | `SessionApplicationService`、`LeaderboardApplicationService`、`AuthApplicationService` |
| Infrastructure | SQLAlchemy 實作的 repositories、Unit of Work、JWT/bcrypt 工具 |
| API | `/api/auth`、`/api/sessions`、`/api/leaderboard`（見 `backend/README.md`） |

### WASM 層：math_engine.c → WebAssembly

C 模組是遊戲的**數學運算核心**，透過 Emscripten 編譯為 `.wasm`，在瀏覽器中直接執行。遊戲運行時，JS 層透過 `ccall`/`cwrap` 呼叫以下 C 函式：

```c
// 矩陣乘法：兩塔連結的線性變換
void matrix_multiply(float a[2][2], float b[2][2], float result[2][2]);

// 軌跡計算：給定函數參數，回傳路徑上的座標點
void calculate_trajectory(float a, float b, float c,
                          float x_start, float x_end, float step,
                          float *out_x, float *out_y, int *count);

// 扇形覆蓋面積：三角函數塔的攻擊範圍
float sector_coverage(float radius, float angle_start, float angle_width);

// 定積分近似（梯形法）：積分砲的面積計算
float numerical_integrate(float (*f)(float), float a, float b, int n);

// 傅立葉合成：計算三個 sin 波的疊加值
float fourier_composite(float t, float freqs[3], float amps[3]);
```

### JS 呼叫 WASM 範例

```js
// 載入 WASM 模組
const MathEngine = await createMathEngine();

// 函數砲：計算砲彈軌跡（一次函數 y = mx + b）
const trajectory = MathEngine.ccall('calculate_trajectory', null,
  ['number', 'number', 'number', 'number', 'number', 'number'],
  [a, b, c, xStart, xEnd, step]
);

// 積分砲：梯形法計算攻擊面積
const area = MathEngine.ccall('numerical_integrate', 'number',
  ['number', 'number', 'number'],
  [a, b, n]
);

// 傅立葉破盾：合成波形
const value = MathEngine.ccall('fourier_composite', 'number',
  ['number', 'array', 'array'],
  [t, freqs, amps]
);
```

### 編譯流程

```bash
# 安裝 Emscripten SDK（一次性）
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest

# 編譯 C → WASM
emcc math_engine.c -o math_engine.js \
  -s EXPORTED_FUNCTIONS='["_matrix_multiply","_calculate_trajectory","_sector_coverage","_numerical_integrate","_fourier_composite"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='createMathEngine' \
  -O2
```

產出 `math_engine.js`（膠水碼）+ `math_engine.wasm`（編譯後的二進位），放入專案即可在瀏覽器中載入。

### C → WASM 的呈現價值

1. **C 是遊戲的真正運算核心**——每一發砲彈、每一次積分、每一次傅立葉合成都經過 C 編譯的 WASM 執行
2. **Demo 零安裝**——教授打開瀏覽器即可遊玩，WASM 隨網頁自動載入
3. **效能對比有實際意義**——可在遊戲內加入開關，切換 JS 純運算 / WASM 運算，即時顯示效能差異（Report 亮點）
4. **架構清晰**——計算層（C）與表現層（JS）分離，展示良好的軟體工程實踐

---

## 十二、音效設計

| 項目 | 方案 |
|------|------|
| 背景音樂 | 免費 chiptune 素材（8-bit 復古遊戲風，搭配像素美術） |
| 音效 | 免費素材：建塔音效、砲彈發射、敵人受傷、敵人死亡、Buff 成功/失敗、Boss 出現 |
| 來源 | OpenGameArt、Freesound、itch.io 等免費授權資源 |

---

## 十三、開發時程（6-7 週）

| 週次 | 工作內容 | 產出 |
|------|----------|------|
| Week 1 | 環境建置 + 核心引擎 + WASM 基礎：Emscripten SDK 安裝、Canvas boilerplate、座標系格線（符文風格）、遊戲迴圈、`math_engine.c` 基礎函式（`calculate_trajectory`）撰寫並編譯為 WASM、驗證 JS ↔ WASM 呼叫通路、敵人沿隨機函數路徑移動 | 座標平面上可看到敵人走動，軌跡由 WASM 計算 |
| Week 2 | 函數砲 + Build Phase UI：手動輸入 m/b、曲線預覽（WASM 計算軌跡點）、交點命中判定、浮動面板 UI（羊皮紙風格） | 第一座塔可玩，砲彈軌跡經由 C/WASM 運算 |
| Week 3 | 雷達掃描塔 + 機率神殿：三角函數塔的角度/弧度/半徑輸入、WASM `sector_coverage` 實作、Buff 卡 UI（3 張卡 + 詛咒 + 跳過）、波次系統 | Level 1-2 可玩 |
| Week 4 | 矩陣連結 + 積分砲：2×2 矩陣輸入 UI、WASM `matrix_multiply` 實作、塔連結動畫、積分砲（輸入函數 + 區間 + WASM `numerical_integrate` 面積計算與預覽） | Level 1-3 可玩 |
| Week 5 | Level 4 + Boss 戰 + 傅立葉：Boss 龍、WASM `fourier_composite` 實作、傅立葉破盾迷你遊戲（波形對比 UI）、隱身史萊姆、排行榜 | 全 4 關可玩 |
| Week 6 | 打磨 + 音效 + 自訂頭像 + 效能對比：chiptune BGM、像素美術精修、自訂頭像上傳功能、JS/WASM 運算切換開關與效能計時器、平衡性調整、Bug 修復 | 完整遊戲 |
| Week 7 | Report + 簡報：撰寫報告（教育理論分析、C/WASM vs JS 效能對比數據）、準備 Demo、最終測試 | 完整交付 |

---

## 十四、分工設計

### 總覽

```
大三（架構 + C/WASM）          大二（雷達掃描塔）          大一（前端 UI）
──────────────────────    ──────────────────────    ──────────────────────
遊戲引擎 Game Loop            雷達掃描塔完整實作          HUD 資訊列
Canvas 座標系渲染              ├ Build Phase 面板         Build Phase 浮動面板框架
math_engine.c + WASM          ├ 扇形即時預覽             Buff 卡翻牌介面
WASM Bridge 封裝              ├ 命中判定邏輯             主選單 / 關卡選擇畫面
敵人系統（路徑/分裂/隱身）       └ 傷害邏輯（DPS）         排行榜頁面
函數砲                                                   自訂頭像上傳（像素化）
矩陣連結塔                                               關卡結算畫面
積分砲                                                   整體視覺風格 CSS
傅立葉破盾迷你遊戲                                        像素風美術素材
機率神殿（Buff 邏輯）          ←── Buff 卡 UI 由大一做     chiptune 音效蒐集
波次系統 / 關卡 JSON 配置                                 Report 撰寫（含效能分析）
隨機路徑生成器                                            簡報製作
JS/WASM 效能對比機制
```

### 介面約定（大三定義，供大二與大一對接）

| 介面 | 大三提供 | 使用方 | 說明 |
|------|---------|--------|------|
| Tower base class | `Tower`（含 `onBuild`、`onWave`、`render` 方法） | 大二 | 大二繼承此 class 實作雷達掃描塔 |
| WASM Bridge | `MathEngine.sectorCoverage(r, θ, Δθ)` 等封裝函式 | 大二 | 大二不需要碰 Emscripten，只呼叫封裝好的 JS 函式 |
| 遊戲事件 hook | `game.on('buildPhaseStart', cb)`、`game.on('waveEnd', cb)` 等 | 大一 | 大一掛 UI 顯示/隱藏邏輯 |
| 遊戲狀態 | `game.state`（金幣、HP、波次、分數） | 大一 | 大一讀取後顯示在 HUD |
| Buff 邏輯結果 | `buffSystem.applyCard(card)` → 回傳成功/失敗 | 大一 | 大一依結果播放對應動畫 |

### 大二：雷達掃描塔（獨立負責）

**選擇理由**：數學邊界清楚（3 個參數、1 個扇形）、與其他塔耦合度低、視覺回饋明確、複雜度適中。

**交付項目**：

| 項目 | 內容 |
|------|------|
| Build Phase UI | 點擊塔後彈出面板，三個輸入欄：起始角度 θ、掃描弧度寬 Δθ、半徑 r |
| 即時預覽 | Canvas 上畫出扇形覆蓋範圍（半透明綠色） |
| 命中判定 | Wave Phase 中判斷敵人座標是否落在扇形內（距離 ≤ r 且角度在 [θ, θ+Δθ] 內） |
| WASM 呼叫 | 透過 WASM Bridge 呼叫 `MathEngine.sectorCoverage()` |
| 傷害邏輯 | 扇形內的敵人持續扣血（DPS 模式） |

**需要學習的技術**：

| 主題 | 原因 | 建議資源 |
|------|------|---------|
| Canvas 2D 基礎 | 畫扇形（`arc`）、填色（`fill`）、座標轉換 | MDN Canvas Tutorial |
| 三角函數基礎 | `sin`/`cos` 極座標 → 直角座標轉換、點在扇形內判定 | GeoGebra 視覺化 |
| 角度 vs 弧度 | Canvas `arc()` 用弧度，玩家輸入用角度，`rad = deg × π / 180` | 一個公式 |
| ES Module | `import`/`export`，與專案架構接軌 | 半小時入門 |
| Git 基礎協作 | `clone`/`pull`/`add`/`commit`/`push`、處理 conflict | GitHub 官方教學 |

### 大一：前端 UI 層（獨立負責）

**選擇理由**：不需要理解遊戲數學邏輯，但對最終成品的觀感與 Demo 體驗影響巨大。

**交付項目**：

| 項目 | 內容 |
|------|------|
| HUD 資訊列 | 波次狀態（Build Phase / Wave X）、金幣、HP、累積分數，深色 + 金色主題 |
| Build Phase 浮動面板框架 | 羊皮紙風格的彈出面板容器（內部輸入欄由大三與大二各自填入） |
| Buff 卡介面 | 3 張卡的翻牌動畫、成功/失敗視覺反饋、跳過按鈕 |
| 主選單 / 關卡選擇畫面 | 開始遊戲、選關卡（4 關）、排行榜入口 |
| 排行榜頁面 | 從 localStorage 讀取並顯示排名列表 |
| 自訂頭像上傳 | `<input type="file">` + Canvas 縮放為 16×16 像素（`imageSmoothingEnabled = false`） |
| 關卡結算畫面 | 總分、擊殺數、排行榜排名變化 |
| 整體視覺風格 | 配色方案實作（深色石板底、金色邊框、monospace 字體）、像素風美術素材 |
| 音效 | 蒐集免費 chiptune BGM 與音效素材 |
| Report + 簡報 | 撰寫報告（教育理論分析、C/WASM vs JS 效能分析）、製作簡報 |

**需要學習的技術**：

| 主題 | 原因 | 建議資源 |
|------|------|---------|
| HTML + CSS 基礎 | 面板佈局、`position: absolute` 浮動面板、flex 排版 | MDN 入門教學 |
| CSS 變數 + 主題配色 | 統一管理暗色主題顏色（`--color-gold`、`--color-stone` 等） | 一篇文章即可 |
| JavaScript DOM 操作 | 動態建立/顯示/隱藏面板、事件綁定 | `querySelector`、`addEventListener`、`classList` |
| Canvas drawImage | 自訂頭像的圖片縮放 + 像素化效果 | MDN drawImage 文件 |
| localStorage | 排行榜存取：`setItem`/`getItem` + JSON 序列化 | 15 分鐘入門 |
| CSS 動畫 / transition | Buff 卡翻牌效果、面板淡入淡出 | `@keyframes` 或 `transition` |
| Git 基礎協作 | 同大二 | GitHub 官方教學 |

### 啟動順序（避免互相卡住）

| 時間 | 大三 | 大二 | 大一 |
|------|------|------|------|
| Week 1 前半 | 遊戲引擎骨架 + 座標系渲染 + WASM 通路 | Canvas + 三角函數學習，用獨立 HTML 練習畫扇形 | HTML/CSS 學習，做主選單靜態頁面 |
| Week 1 後半 | Tower base class + WASM Bridge 封裝 → 推上 Git | 用獨立 HTML 練習：畫扇形 + 判斷滑鼠是否在扇形內 | HUD 靜態版本（先 hardcode 數值） |
| Week 2 起 | 開發函數砲 | 把雷達塔接進遊戲引擎 | 把 HUD 接上 `game.state`，開始做 Buff 卡 UI |

---

## 十五、競品分析與差異化

### 現有「數學塔防」遊戲

| 遊戲 | 模式 | 數學程度 | 數學角色 |
|------|------|----------|----------|
| Defense Math | 答加減乘除發射砲彈 | 國小四則 | 門檻（答對才能射擊） |
| Hooda Math Defense | 答題換金幣買塔 | 國小四則 | 貨幣（數學 = 錢） |
| Math Tower Defense (App) | 解題解鎖砲塔 | 國小四則 | 門檻 |
| Super Number Defense | 組合算式提升攻擊力 | 國小四則 | 嵌入式（最接近我們） |

### 我們的差異化

| 差異點 | 說明 |
|--------|------|
| 數學層級 | 高中～大學（函數、三角、矩陣、機率、微積分、傅立葉） |
| 整合深度 | 數學 IS 機制（函數 = 軌跡、面積 = 範圍、矩陣 = 變換、期望值 = 決策） |
| 地圖設計 | 座標平面本身就是學習工具 |
| 路徑隨機化 | 每局不同函數，不可背答案，測試真正的數學理解力 |
| 教學設計 | 手動輸入 + Productive Failure + 概念術語即時標示 |
| 進階機制 | 積分砲（定積分 = 面積 = 攻擊範圍）、傅立葉破盾（波形分解） |
| 理論基礎 | 有教育理論支撐 |

---

## 十六、評分策略

### Creativity, Novelty, and Originality

- 「數學即機制」的設計在同類遊戲中獨一無二
- 引用 Hernández-Sabaté et al. (2015)：學術界建議設計「數學即機制」的遊戲，我們正是回應此建議
- 座標平面地圖設計讓整個遊戲成為一張活的數學圖表
- 隨機路徑系統確保學習的遷移性
- 積分砲的「面積 = 攻擊範圍」設計將抽象數學概念完全具象化
- 傅立葉破盾作為 Boss 戰機制，前所未見
- 分裂史萊姆的 y = f(x) + 1 隱性教授函數平移

### Technical Execution

- HTML5 Canvas 遊戲引擎（遊戲迴圈、渲染、碰撞檢測）
- 函數交點計算（聯立方程式求解）
- 隨機函數路徑生成器（含參數邊界約束）
- 數值積分演算法（梯形法）
- 傅立葉波形合成與匹配度計算
- C → WebAssembly（Emscripten）：數學運算核心在瀏覽器中以 WASM 執行，JS 透過 `ccall`/`cwrap` 呼叫
- 遊戲內 JS/WASM 運算切換開關 + 即時效能對比

### Art and Design

- 中世紀奇幻 × 像素風的統一美術風格
- 座標格線作為「符文」融入場景
- 羊皮紙風格的 Build Phase 浮動面板
- 傅立葉破盾的波形對比視覺化
- 自訂頭像的像素化效果
- chiptune 音效搭配像素美術

### Presentation and Report

- Demo 零安裝：教授打開瀏覽器即可遊玩
- 現場讓教授手動輸入 y = mx + b 體驗函數砲
- 讓教授上傳自己的照片體驗自訂頭像
- Report 包含教育理論分析
- 現場切換 JS/WASM 運算模式，展示 C → WebAssembly 效能對比
- 競品分析表格

---

## 十七、Report 可引用的教育理論

| 理論 | 作者 | 在遊戲中的體現 |
|------|------|----------------|
| Bloom's Taxonomy | Bloom (1956) | 函數砲 = Apply，機率神殿 = Evaluate，矩陣連結 = Analyze，積分砲 = Create |
| Zone of Proximal Development | Vygotsky (1978) | 隨機池遞增設計，進階機制作為「差一點就能懂」的挑戰 |
| Flow Theory | Csikszentmihalyi (1990) | 無波次結算保持心流，難度隨關卡遞增 |
| Productive Failure | Kapur (2008) | Build Phase 允許無限試錯，但每次修改都需要數學推理 |
| Transfer Learning | 各學者 | 隨機路徑確保玩家無法死記答案，必須遷移運用數學知識 |
| Game-Based Learning in TD | Hernández-Sabaté et al. (2015) | 研究建議設計「數學即機制」的塔防遊戲——我們正是回應此建議 |
| Expected Value Decision Making | Kahneman & Tversky (1979) | Buff 卡系統的風險決策，可引用前景理論分析玩家行為 |
