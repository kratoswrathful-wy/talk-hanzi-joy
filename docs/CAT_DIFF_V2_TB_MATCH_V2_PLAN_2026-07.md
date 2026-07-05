# CAT 追蹤修訂 Diff v2 ＋ TB Match Engine v2 — 技術變更計畫

**狀態**：規劃中（決策已確認；待其他改動告一段落後始可實作）  
**日期**：2026-07-05（決策更新：2026-07-05）  
**範圍**：`cat-tool/`（Vanilla CAT）；**不含 DB migration**（`matchFlags` 以 optional field 擴充即可）  
**前置文件**：[`CAT_REVISION_TRACKING_PHASE_C_SPEC_2026-06.md`](./CAT_REVISION_TRACKING_PHASE_C_SPEC_2026-06.md)、[`CAT_TB_DEDUP_AND_SUPPRESS_2026-06.md`](./CAT_TB_DEDUP_AND_SUPPRESS_2026-06.md)

---

## 摘要

本計畫一次規劃兩項子功能：

| 代號 | 問題 | 目標 |
|------|------|------|
| **A. Diff v2** | 追蹤修訂與 CAT 比對欄以**字元級 LCS** 顯示差異，英文單字被切碎 | 共用 **readable token diff**；Phase C **可見**「精細 diff」checkbox（預設關） |
| **B. TB Match v2** | `termMatches` 預設 `wholeWord: false` → 子字串誤命中（Layer→player） | 預設 **token boundary** + 英文**保守**詞形；`allowSubstring` 作舊式逃生口 |

兩者共用 **`cat-text-tokenizer.js`**（切 token／atomic 判斷／語言正規化），但 **diff engine 與 TB engine 各自獨立**，互不 import renderer 或比對 UI。

### 已確認決策（2026-07-05）

| # | 決策 | 摘要 |
|---|------|------|
| 1 | **TB 預設 token boundary + `allowSubstring` 逃生口** | 英文／拉丁預設不再 `includes` 子字串；僅 `matchFlags.allowSubstring === true` 時恢復舊式子字串 |
| 2 | **Phase C 可見「精細 diff」checkbox** | 預設關；readable 為預設體驗；`localStorage` 可記住選擇；CAT 比對欄加低調切換 |
| 3 | **英文 morphology 保守策略** | 完整 token 相等優先；僅從術語產生**已知 suffix 白名單**表面形式；禁止任意 stem 截斷 |

---

## 1. 現有追蹤修訂 diff 流程整理

### 1.1 兩套獨立實作（尚未共用）

| 模組 | 核心函式 | 演算法 | 輸出 CSS |
|------|----------|--------|----------|
| [`cat-tool/js/tm-utils.js`](../cat-tool/js/tm-utils.js) | `diffCharsCurrentVsTm` | 字元級 LCS（`Array.from` 逐 code unit） | `.tm-diff-cur-only`（藍底線＝新側独有）、`.tm-diff-tm-only`（紅刪除線＝舊側独有） |
| 同上 | `buildTmTrackChangeStackHtml` | 三列 stack：舊原文｜合併 diff｜新原文純文字 | `.tm-track-stack` |
| 同上 | `buildTmTargetRevisionDiffHtml` | 單行合併 diff（舊譯→新譯） | 同上 class |
| [`cat-tool/js/rev-track-diff.js`](../cat-tool/js/rev-track-diff.js) | `computeCharDiff` / `renderDiffHtml` | **另一份**字元級 LCS | `.rev-diff-del`、`.rev-diff-ins` |
| 同上 | `tokenizeWithTags` / `renderDiffTokens` | tag 以 `{display}` 為 atomic；無 tag 時仍 fallback **字元 diff** | `.rev-track-tag-pill` |

語意差異：`tm-utils` 的 `delete`＝**目前句段有、TM 無**；`insert`＝**TM 有、目前句段無**。Phase C `rev-track-diff` 的 `del`/`ins` 則以「左欄舊快照 vs 右欄新快照」為準。v2 需在 **render 層**保留各自語意映射，**diff 核心**統一。

### 1.2 UI 呼叫點

| 位置 | 函式 | 觸發時機 |
|------|------|----------|
| [`cat-tool/app.js`](../cat-tool/app.js) `updateCatTrackPanelContent` | `buildTmTrackChangeStackHtml(seg.sourceText, m.sourceText)` | 選取 TM／Fragment／MqInserted 列時，右側 CAT「追蹤修訂」面板 |
| 同上 `formatCatTmChangeLogForFooter` | `buildTmTargetRevisionDiffHtml(cl.oldTarget, cl.newTarget)` | 比對表 footer「更新紀錄」中 `kind: 'targetUpdate'` 條目 |
| [`cat-tool/js/rev-track.js`](../cat-tool/js/rev-track.js) | `CatRevTrackDiff.renderSnapshotCell` | Phase C 追蹤修訂模式各階段譯文欄（baseline／translate／review） |

### 1.3 相關 CSS（[`cat-tool/style.css`](../cat-tool/style.css)）

- **CAT 比對欄**：`.tm-track-stack`、`.tm-track-stack-row`、`.tm-diff-cur-only`、`.tm-diff-tm-only`（約 L2313–2338）
- **Phase C 模式**：`.rev-diff-del`、`.rev-diff-ins`、`.rev-track-tag-pill`（約 L4578–4595）
- **句段橘色邊條**（原文有變）：`.grid-data-row.source-changed`（與 diff 引擎無直接耦合）

### 1.4 其他字元級差異

- [`cat-tool/js/tm-utils.js`](../cat-tool/js/tm-utils.js) `levenshtein` / `calculateSimilarity`：TM **相似度分數**，非 UI diff，**不在本次合併範圍**。
- [`cat-tool/word-count-engine.js`](../cat-tool/word-count-engine.js) 另有獨立 `levenshtein`：字數統計，不動。
- **無**其他 UI 字元 diff 路徑；AI 審稿表頭「追蹤修訂」欄為 Phase C 同一套 `CatRevTrackDiff`。

### 1.5 現況問題

1. **兩份 LCS 實作**維護成本高，行為易漂移。
2. 字元 diff 使 `degraded→degrade` 只標 `ed`，不可讀。
3. `rev-track-diff` 的 tag token 在 diff 失敗時仍可能以 `\u0001` 分隔後做字元 diff，tag 邊界外文字仍會碎裂。
4. 超長句僅 `TM_DIFF_MAX_CHARS=6000` 時 fallback 為純文字，無「修改幅度大」提示。

---

## 2. 現有 TB 比對流程整理

### 2.1 核心比對（[`cat-tool/app.js`](../cat-tool/app.js) L10865–10911）

```text
termMatches(haystack, needle, flags)
  ├─ caseInsensitive: 預設 true
  ├─ wholeWord: 預設 false → h.includes(n)  ← 子字串誤命中根因
  └─ wholeWord true → RegExp (^|\W)needle(\W|$)

findTermHitRangesInPlainText(text, needle, flags)
  └─ indexOf 迴圈 + 可選 \W 邊界（與 termMatches 對齊）
```

**`\W` 侷限**：僅 ASCII「非 word char」；對 `{player_name}`、全形標點、tag pill 邊界不完整。

### 2.2 ActiveTbTerms 生命週期

| 時機 | 行為 |
|------|------|
| 開檔／掛載 TB | `window.ActiveTbTerms.push(mapDbTermToActiveTbTerm(...))` |
| 術語庫頁改刪 | `rebuildActiveTbTermsFromProject()` → `refreshEditorTbUiAfterTermsChange()` |
| 預設 flags | `{ caseInsensitive: true, wholeWord: false }`（[`mapDbTermToActiveTbTerm`](../cat-tool/app.js)） |

### 2.3 比對結果消費路徑

```text
ActiveTbTerms
  ├─ renderLiveTmMatches(seg)
  │    ├─ termMatches(src, termSrc) 篩選
  │    ├─ findTermHitRangesInPlainText → ranges
  │    ├─ shouldSuppressTbHit（長詞壓短詞，嚴格大小寫子字串）
  │    ├─ groupBy 原文+譯文 → dedupeTbEntriesByTbId
  │    └─ currentTmMatches → 右欄比對表
  │
  ├─ decorateTbInlineHintsForSegId(segId)
  │    ├─ 依 currentTmMatches 的 TB 列（含 offpage）
  │    ├─ 每 text node：findTermHitRangesInPlainText
  │    └─ 底線／上標／副行列表
  │
  ├─ _qaPushSegmentRuleFindings（QA 術語未套用）
  │    └─ termMatches(source) && !termMatches(target) — **不過濾隱藏**
  │
  └─ AI 批次 _buildAiOptions / 分批 filter
       └─ termMatches(s.sourceText, t.source, t._matchFlags)
```

**譯文側**「是否已套用譯法」仍用 `termMatches(tgtPlain, term.target, mf)`；v2 主要改**原文命中**與 **ranges**；譯文側第一版維持現有邏輯（降低 scope）。

### 2.4 後處理（保留）

- `shouldSuppressTbHit` + `isTbSourceStrictSubstring`（Card/card 修正，`1304299`）
- 同原文同譯文合併、`dedupeTbEntriesByTbId`
- `_sessionHiddenTbPairs` 工作階段隱藏
- 長詞優先排序：`byLen` 再壓制

### 2.5 現況問題

1. 預設子字串：`Layer` 命中 `player`、`Sion` 命中 `permission`、`lat` 命中 `humiliation`。
2. `wholeWord: true` 仍無英文複數／時態變化（`Game` 不命中 `Games`）。
3. 原文格 inline 裝飾與右欄雖共用函式，但未 token-aware；placeholder 內部仍可能誤命中。
4. `pullCrossNodeWordSuffix` 用 `\w` 延伸錨點，與 v2 token 邊界需對齊。

---

## 3. 目前需要修改的檔案與函式

### 3.1 新增（`cat-tool/js/`）

| 檔案 | 職責 |
|------|------|
| **`cat-text-tokenizer.js`** | 共用 tokenization、atomic 判斷、`normalizeLangCode` / `isEnglishSourceLang` |
| **`cat-diff-engine.js`** | token LCS、readable／char 模式、大幅修改 fallback、HTML render 核心 |
| **`cat-diff-engine.test.mjs`** | Vitest 可 import 之 pure 測試（見 §9） |
| **`tb-match-engine.js`** | `findTbTermRanges`、`termMatches`、`matchTermInHaystack`、`expandEnglishSurfaceForms` |
| **`tb-match-engine.test.mjs`** | 驗收案例回歸 |

### 3.2 重構（薄包裝，行為遷至新模組）

| 檔案 | 變更 |
|------|------|
| **`tm-utils.js`** | `diffCharsCurrentVsTm` → 委派 `CatDiffEngine`；保留 window 別名；`buildTm*` 改用統一 render |
| **`rev-track-diff.js`** | 移除重複 LCS；`renderSnapshotCell` 改用 `CatDiffEngine` + tag token 適配層 |
| **`rev-track.js`** | 讀取 `#revTrackChkFineDiff`；切換時 `reload()` grid |
| **`app.js`** | `termMatches` / `findTermHitRangesInPlainText` → 薄 wrapper 呼叫 `TbMatchEngine`；呼叫點**不換名** |
| **`index.html`** | 在 `tm-utils.js` **之前**載入新模組；Phase C bar 加 checkbox；CAT 面板加低調切換 |

### 3.3 樣式

| 檔案 | 變更 |
|------|------|
| **`style.css`** | `.cat-diff-fallback-banner`、`.cat-diff-fallback-old/new`、`.cat-diff-mode-link`、`.rev-track-bar-label` 延伸 |

### 3.4 文件（實作後）

| 檔案 | 時機 |
|------|------|
| **`docs/CODEMAP.md`** | 驗收後記現況 |
| 本檔 | 驗收後標「已驗收，細節以程式為準」 |

### 3.5 不在本次修改

- TM 相似度 `levenshtein`（`tm-utils.js`）
- TB 合併／隱藏／footer 編輯 UI 邏輯（僅換底層命中；**allowSubstring UI 延後**）
- Supabase schema migration（`matchFlags` 已是 JSONB／Dexie 物件，**optional field 即可**）
- 實作完成前**不**先改 `public/cat/`（見 §13、§14）

---

## 4. 建議新增的共用 tokenizer / helper 設計

### 4.1 模組：`window.CatTextTokenizer`（IIFE）

#### 公開 API

```javascript
tokenizeForCatText(text, options?)
normalizeLangCode(lang)        // → 'en' | 'zh' | 'ja' | 'ko' | 'latin' | 'und'
isEnglishSourceLang(lang)
isAtomicToken(token)
isLatinWordToken(token)
isCjkToken(token)
isPlaceholderToken(token)
isTagToken(token)
isUrlOrEmailToken(token)
isIdentifierKeyToken(token)    // UI_BUTTON_*、snake_case key
tokensToPlain(tokens)
mapPlainOffsetToToken(text, offset)  // TB ranges 對齊用
```

#### Token 結構

```javascript
{ kind, value, start, end, meta? }
// kind: 'latin'|'number'|'unit'|'cjk'|'placeholder'|'tag'|'url'|'email'|'filename'|'key'|'punct'|'space'|'other'
```

### 4.2 Tokenization 規則（第一版）

掃描順序（長模式優先）：placeholder → URL → email → XML/HTML tag → key → 數字+單位 → CJK 連續串 → 拉丁詞 → 檔名 → 其餘標點／空白。

**Atomic 不可拆**：placeholder、tag、url、email、filename、key、number+unit 整段。

### 4.3 語言正規化

來源語言讀取優先序：`window.ActiveFileLangs.sourceLang` → 句段 `sourceLang` → 專案 `sourceLangs[0]`。

---

## 5. Diff Engine v2 設計

### 5.1 模組：`window.CatDiffEngine`

```javascript
computeDiff(oldText, newText, options?)     // → DiffOp[]
renderDiffHtml(oldText, newText, options?)
renderTrackStackHtml(oldText, newText, options?)
renderInlineMergedHtml(oldText, newText, options?)
getDiffMode() / setDiffMode('readable'|'char')  // 讀寫 localStorage
```

#### `options`

| 欄位 | 預設 | 說明 |
|------|------|------|
| `mode` | `'readable'` | `'readable'` \| `'char'` |
| `tagsOld` / `tagsNew` | — | Phase C／tag-aware diff |
| `semantics` | `'current-vs-reference'` | TM 面板；Phase C 用 `'old-vs-new'` |
| `maxTokens` | 4000 | 超過則 fallback |
| `fallbackRatio` | 0.55 | 變更 token 占比超過 → 大幅修改 UI |

### 5.2 Readable diff 演算法

Token 序列 LCS；atomic token 不拆分；CJK 整段替換；僅 `mode:'char'` 才 intra-token 字元 diff。

### 5.3 大幅修改 Fallback

`.cat-diff-fallback-banner` + 上下純文字對照列（`.cat-diff-fallback-old` / `.cat-diff-fallback-new`）。

### 5.4 Fine-grained / char diff 切換（**已確認：可見 UI**）

#### Phase C — 主控制項

| 項目 | 規格 |
|------|------|
| **位置** | `#revTrackBar`（[`index.html`](../cat-tool/index.html) L801–806），與「修訂標記」checkbox **同一列** |
| **DOM id** | `#revTrackChkFineDiff`（新建） |
| **label** | `精細 diff`（class：`.rev-track-bar-label`，與 `#revTrackChkMarks` 一致） |
| **預設** | **未勾選** → `mode: 'readable'` |
| **行為** | 勾選 → `CatDiffEngine.setDiffMode('char')` + `CatRevTrack.reload()` 重繪可見列 |
| **JS 觸點** | [`rev-track.js`](../cat-tool/js/rev-track.js) `bindEvents()`、`renderGrid()`、`state.layerVisibility` 旁新增 `fineDiff` 狀態 |

#### CAT 比對欄 — 低調切換

| 項目 | 規格 |
|------|------|
| **位置** | `#catTrackChangePanel` 內、`#liveTrackChangeContent` **上方**或右上角 |
| **DOM id** | `#catDiffModeLink`（`<button type="button" class="cat-diff-mode-link">` 或 `<a>`） |
| **文案** | 預設顯示「字元級 diff」連結；已開啟時顯示「可讀 diff」可切回 |
| **預設** | readable；**本次一併實作**（非延後） |
| **JS 觸點** | `updateCatTrackPanelContent()` 前讀 mode；點擊後重呼叫 panel + footer diff |

#### localStorage 持久化

| 鍵 | 值 | 說明 |
|----|-----|------|
| `catDiffMode` | `'readable'` \| `'char'` | Phase C checkbox 與 CAT 連結**共用**同一設定 |
| 預設缺省 | `'readable'` | 首次進入或未寫入時 |

**兩處 UI 同步**：任一端切換時，更新 localStorage 並刷新另一處控件狀態（若同時可見）。

#### 會動到的 CSS class

- 既有：`.rev-diff-del`、`.rev-diff-ins`、`.tm-diff-cur-only`、`.tm-diff-tm-only`
- 新增：`.cat-diff-mode-link`、`.cat-diff-fallback-*`
- Phase C bar：沿用 `.rev-track-bar-label`、`.rev-track-layer-chk` 模式

### 5.5 統一 render 規則

| 語意 | delete 樣式 | insert 樣式 |
|------|-------------|-------------|
| TM 追蹤（current vs TM） | `.tm-diff-cur-only` | `.tm-diff-tm-only` |
| Phase C／譯文更新（old vs new） | `.rev-diff-del` | `.rev-diff-ins` |

**同一 `CatDiffEngine` 核心**；僅 `semantics` + class 映射不同。

---

## 6. TB Match Engine v2 設計

### 6.1 模組：`window.TbMatchEngine`

```javascript
findTbTermRanges(text, term, options?)
termMatches(haystack, needle, flags, options?)
matchTermInHaystack(haystack, needle, flags, options?)
expandEnglishSurfaceForms(term)   // 內部：白名單 suffix 展開
```

### 6.2 比對策略矩陣

| 來源語言 | 拉丁/數字術語 | 片語 | CJK 術語 |
|----------|---------------|------|----------|
| **英文** | token boundary + **保守詞形** | token-by-token 白名單表面形式 | N/A |
| **其他拉丁** | token boundary only | 逐 token 相等 | N/A |
| **中文/日/韓** | 子字串包含（不受 token boundary 限制） | 同左 | 同左 |
| **全部** | placeholder/tag/url/email/key **內部禁止命中** | | |

#### Token boundary（非 CJK，且 `allowSubstring !== true`）

- 術語與原文皆 `tokenizeForCatText`
- 命中須對齊 **完整 token**（range 與 token `start`/`end` 一致）
- `wholeWord: true`（TB「精確比對」）：在 token boundary 之上維持更嚴格邊界
- **v2 預設**（`allowSubstring` 未設或 `false`）：**禁止**一般 `includes` 子字串

範例（預設）：

- `Layer` **不**命中 `player`
- `Sion` **不**命中 `permission`
- `lat` **不**命中 `humiliation`

#### `allowSubstring` 逃生口（**已確認**）

| 項目 | 規格 |
|------|------|
| **存放位置** | 術語 `matchFlags` 物件：`{ caseInsensitive, wholeWord, allowSubstring }` |
| **型別** | `boolean`；optional |
| **舊資料預設** | 欄位不存在 → **`allowSubstring: false`**（走 token boundary） |
| **為 true 時** | 英文／拉丁恢復**舊式** `haystack.includes(needle)`（仍尊重 `caseInsensitive`；`wholeWord` 疊加既有 RegExp 邏輯） |
| **CJK 術語** | 不受 `allowSubstring` 影響（向來為子字串包含） |
| **Engine option** | `TbMatchEngine.findTbTermRanges(..., { flags, allowSubstring })` 與 flags 同步 |
| **第一版 UI** | **不做**術語庫／footer 編輯勾選；僅 engine + 文件說明 |
| **後續 UI** | 可於 TB footer「比對屬性」區加第四項「允許子字串比對」；與精確比對並列 |
| **DB migration** | **不需要**。Dexie `terms[].matchFlags` 與 Supabase TB JSON 已為自由物件；讀取時 `flags.allowSubstring === true` 才啟用 |
| **系統預設** | [`mapDbTermToActiveTbTerm`](../cat-tool/app.js) 維持 `{ caseInsensitive: true, wholeWord: false }`；**不**預設 `allowSubstring: true` |

#### 英文 Morphology（**保守策略 — 已確認**）

**禁止**：任意 stem 截斷、stem 相等、編輯距離、或「去掉 suffix 後比對」。

**允許**：僅當原文 token **完整字串**等於下列之一時命中：

1. 術語 surface form 本身（大小寫依 `caseInsensitive`）
2. 由術語 **逐 token** 套用**已知安全 suffix 表**所產生的候選表面形式

**已知 suffix 白名單（第一版）**：

| 類型 | 規則 | 範例 |
|------|------|------|
| 複數 | `+s`（詞尾已有 s/x/z/ch/sh → `+es`；consonant+y → 去 y + `ies`） | `Game→Games`、`Boundary→Boundaries` |
| 第三人稱 | `+s` / `+es` | `Apply→applies` |
| 過去式 | `+ed`；規則音變僅限**明確拼寫**（如 e 去加 `d`：`applied`） | `Apply→applied` |
| 現在分詞 | `+ing`；僅限**明確拼寫**（`applying`） | `Apply→applying` |
| 同詞幹其他 | `Unlock→unlocks`、`unlocked`、`unlocking` | 同上規則生成 |

**明確不生成、不命中**：

- `Apply` → `application`（`-tion` 不在白名單）
- `press` → `pressure`（`-ure` 不在白名單）
- `use` → `user`（`-r` 不在白名單）

**片語**（`Game Mode`）：

- 對**每個 token** 各自展開候選集合
- 滑動窗口長度 = 術語 token 數
- 窗口內第 i 槽：原文 token 必須 **完整等於** 術語第 i token 的某一候選表面形式
- 例：`Game Mode` 可命中 `Game Modes`；不可因 stem 命中 `Game Moderation`

**比對優先序**：

1. 原文 token === 術語 token（精確／大小寫規則）
2. 原文 token ∈ `expandEnglishSurfaceForms(術語 token)`（完整字串）
3. 否則不命中（**不做** fallback stem）

### 6.3 `termMatches` 向後相容

`app.js` 保留函式名，內部委派 `TbMatchEngine`；`flags` 原樣傳入（含 optional `allowSubstring`）。

### 6.4 命中表面形式（UI — 延後至低衝突階段）

右欄 TB footer 顯示「命中：Games」等；見 §14 步驟 6。

### 6.5 與既有後處理銜接

`findTbTermRanges (v2)` → `shouldSuppressTbHit` → groupBy / dedupe / hidden → UI。**Card/card**、**Mark Anthony** 邏輯不變。

### 6.6 Placeholder

`{player_name}` 為 atomic；`Layer`／`player` 不得命中 placeholder 內部。

---

## 7. 兩者如何共用 tokenization，但保持模組獨立

```text
cat-text-tokenizer.js
        ├─ cat-diff-engine.js   → tm-utils / rev-track-diff / rev-track
        └─ tb-match-engine.js   → app.js wrappers
```

**禁止** diff ↔ TB 互相 import。

---

## 8. 可能風險與回歸點

| 風險 | 影響 | 緩解 |
|------|------|------|
| morphology 白名單漏覆蓋 | 合法複數未命中 | 驗收 T6–T11 + 消極案例 T16–T18 |
| `allowSubstring` 未暴露 UI | 舊專案少數 intentional 子字串需手改 JSON | 文件說明；後續 footer UI |
| 與其他分支改 `app.js` 衝突 | merge 痛苦 | §12–§14 拆工；wrapper 延後 |
| `public/cat` 大量 diff | 與他人 sync 衝突 | 最後一步才 sync |
| Phase C + 其他 rev-track 改動 | checkbox 衝突 | engine 先完成；UI 後接 |

---

## 9. 驗收案例清單

### 9.1 Diff v2

| # | 輸入 | 預期（readable 模式） |
|---|------|------------------------|
| D1 | `degraded` → `degrade` | 整詞 delete + insert |
| D2 | `will degrade` → `will not degrade` | `not` 為 insert token |
| D3 | `15%` → `20%` | 數字+單位整 token 替換 |
| D4 | `3.5s` → `4s` | 整 token 替換 |
| D5 | `{player_name}` → `{user_name}` | placeholder 整段 del/ins |
| D6 | `<b>Start</b>` → `<strong>Start</strong>` | tag atomic |
| D7 | `UI_BUTTON_*` key 替換 | key 整段替換 |
| D8 | 中文句局部修改 | CJK 連續 token，非逐字碎裂 |
| D9 | 大幅改寫 | fallback banner + 上下對照 |
| D10 | CAT 面板 vs footer 譯文更新 | **同一** diff engine；semantics／class 各正確 |
| D11 | Phase C 預設 | checkbox **未勾** → readable |
| D12 | Phase C 勾「精細 diff」 | char diff |
| D13 | CAT `#catDiffModeLink` | 與 Phase C **共用** `catDiffMode` localStorage |
| D14 | 含 XLIFF tag pill | tag 整 pill del/ins |

### 9.2 TB Match v2

| # | 原文 | 術語 | 預期 |
|---|------|------|------|
| T1 | `player` | `Layer` | **不命中**（預設 boundary） |
| T2 | `Layer.` | `Layer` | 命中 |
| T3 | `Layers` | `Layer` | 命中（白名單複數） |
| T4 | `permission` | `Sion` | **不命中** |
| T5 | `humiliation` | `lat` | **不命中** |
| T6 | `Games` | `Game` | 命中 |
| T7 | `Boundaries` | `Boundary` | 命中 |
| T8 | `applies` / `applied` / `applying` | `Apply` | 命中 |
| T9 | `unlocks` / `unlocked` / `unlocking` | `Unlock` | 命中 |
| T10 | `Game Modes` | `Game Mode` | 命中 |
| T11 | `Power Utilities` | `Power Utility` | 命中 |
| T12 | `Mark Anthony … Anthony` | 長詞壓短詞 | 僅範圍內壓制 |
| T13 | `Card` / `card` | 兩 TB | 兩列，無誤壓制 |
| T14 | `{player_name}` | `Layer` / `player` | **不命中** |
| T15 | 右欄／inline／QA／AI | 同句 | **同一**命中結果 |
| T16 | `application` | `Apply` | **不命中** |
| T17 | `pressure` | `press` | **不命中** |
| T18 | `user` | `use` | **不命中** |
| T19 | `player` + `allowSubstring: true` | `lay` | **命中**（舊式子字串） |
| T20 | `player` + `allowSubstring` 未設 | `Layer` | **不命中** |

### 9.3 測試落地

- Pure：`cat-tool/js/*.test.mjs`
- Vitest：擴充 `vitest.config.ts` 或 `npm run test:cat`
- 手動：CAT 編輯器全流程

---

## 10. 建議實作順序（單人線性版）

> 若與其他改動並行，請改依 **§14 拆工策略**。

1. tokenizer + tests（新檔 only）
2. diff engine + tm-utils 接入
3. Phase C rev-track-diff + rev-track checkbox + style
4. tb-match-engine boundary + morphology + tests
5. app.js wrappers
6. decorateTbInlineHints 對齊
7. surface form UI、allowSubstring UI（可選）、sync、CODEMAP

---

## 11. 建議拆 commit 方式

| 順序 | Commit | 內容 |
|------|--------|------|
| 1 | `feat(cat): add shared text tokenizer` | 新檔 + tests + index script |
| 2 | `feat(cat): diff engine v2` | cat-diff-engine + tm-utils |
| 3 | `feat(cat): Phase C fine diff checkbox` | rev-track* + style + index |
| 4 | `feat(cat): TB match engine v2` | tb-match-engine + tests |
| 5 | `feat(cat): wire TB engine in app.js` | wrappers only |
| 6 | `fix(cat): TB inline hints token ranges` | decorateTbInlineHints |
| 7 | `feat(cat): TB surface form footer` | renderLiveTmMatches UI |
| 8 | `chore(cat): sync public/cat` | 最後 |

---

## 12. 預計動到的檔案、函式與衝突風險

| 檔案 | 預計動到的函式 / DOM / CSS | 修改目的 | 衝突風險 | 為什麼可能衝突 | 建議降低衝突 |
|------|---------------------------|----------|----------|----------------|--------------|
| **`cat-tool/js/cat-text-tokenizer.js`**（新） | 全檔新建 | 共用 tokenization | **低** | 新檔，不與既有行衝突 | **可最先 merge** |
| **`cat-tool/js/cat-diff-engine.js`**（新） | 全檔新建 | readable/char diff、render | **低** | 新檔 | 與 tokenizer 同 PR |
| **`cat-tool/js/tb-match-engine.js`**（新） | 全檔新建 | TB 比對 v2 | **低** | 新檔 | 與 tokenizer 同 PR 或獨立 PR |
| **`cat-tool/js/*.test.mjs`**（新） | 測試 | 回歸 | **低** | 新檔 | 與對應 engine 同 commit |
| **`cat-tool/js/tm-utils.js`** | `diffCharsCurrentVsTm`、`buildTmTrackChangeStackHtml`、`buildTmTargetRevisionDiffHtml` | 接 diff engine | **中** | 比對欄/footer 若他人改 TM 區塊 | Diff 階段先做；避開他人改 tm-utils 時段 |
| **`cat-tool/js/rev-track-diff.js`** | `computeCharDiff`、`renderDiffHtml`、`renderDiffTokens`、`renderSnapshotCell` | 統一 diff 核心 | **中** | Phase C 若他人改 diff/tag | engine 穩定後再改；與 rev-track.js 同批 |
| **`cat-tool/js/rev-track.js`** | `bindEvents`、`renderGrid`、`state`；讀 `#revTrackChkFineDiff` | 精細 diff checkbox | **高** | Phase C 追蹤修訂模式常並行開發 | **等 Phase C 其他改動穩定**再加 checkbox |
| **`cat-tool/app.js`** | **`termMatches`**、**`findTermHitRangesInPlainText`**、**`renderLiveTmMatches`**、**`decorateTbInlineHintsForSegId`**、**`_qaPushSegmentRuleFindings`**、AI 批次 `termMatches` filter（約 L36325+、L37682+）、`updateCatTrackPanelContent`、`formatCatTmChangeLogForFooter` | TB wrapper、inline、panel diff 刷新 | **高** | 巨型檔；W9／workflow／TB UI 常改 | wrapper **單獨小 commit**；inline **最後**；與他人 diff app.js 前先 rebase |
| **`cat-tool/index.html`** | `<script src="js/cat-text-tokenizer.js">` 等順序；`#revTrackChkFineDiff`；`#catDiffModeLink` | 載入新模組、UI 控件 | **中** | script 區與 editor 區多人改 | script 追加在 tm-utils **前**；UI 控件與 rev-track 同批 |
| **`cat-tool/style.css`** | `.cat-diff-fallback-*`、`.cat-diff-mode-link`；可能觸及 `.tm-diff-*`、`.rev-diff-*` | diff fallback、toggle 樣式 | **中** | 全檔 4600+ 行，CAT/TB 樣式常改 | 新增區塊放 Phase C 區末；少改既有 selector |
| **`public/cat/**`** | 上述檔案鏡像 | sync 產物 | **高**（合併時） | 任何 cat-tool 變更都複製整包 | **驗收後一次** `npm run sync:cat`；實作中不同步 |
| **`vitest.config.ts` / `package.json`** | `include` 或 `test:cat` script | 跑 cat-tool 測試 | **低** | 與 W6 vitest 批次可能同改 | 獨立小 commit |
| **`docs/CODEMAP.md`** | 新增模組條目 | 驗收後現況 | **低** | 多人補文件 | 最後 commit |
| **本檔** | 計畫維護 | 規格 | **低** | 僅文件 | 已更新 |

### 12.1 高風險區詳表

#### `app.js`

| 函式／區塊 | 變更類型 | 與他工衝突情境 |
|-----------|----------|----------------|
| `termMatches` / `findTermHitRangesInPlainText` | 改為 3–5 行 wrapper | 他人改 TB 比對屬性、QA |
| `renderLiveTmMatches` | tbHits 收集邏輯不變；footer 加 surface form（後段） | 右欄比對 UI、MqInserted |
| `decorateTbInlineHintsForSegId` | ranges 來源改 token 對齊；`pullCrossNodeWordSuffix` | 虛擬捲動、TB 上標 |
| `_qaPushSegmentRuleFindings` | 間接（wrapper 行為變） | QA 波次 |
| AI 批次 `termMatches` filter | 間接 | AI 批次穩定修正 |
| `updateCatTrackPanelContent` | 讀 diff mode；可能掛 `#catDiffModeLink`  handler | CAT 面板 UX |

#### `rev-track.js` / `rev-track-diff.js`

| 項目 | 變更 |
|------|------|
| `#revTrackChkFineDiff` | 新 checkbox + event |
| `CatRevTrackDiff.*` | 委派 `CatDiffEngine` |
| 風險 | 追蹤修訂模式、快照、評註 UI 並行修改 |

#### `tm-utils.js`

| 項目 | 變更 |
|------|------|
| `buildTmTrackChangeStackHtml` 等 | 接 diff engine；**不**改 `levenshtein` |
| 風險 | TM 相似度或比對欄他人調整 |

#### `index.html`

| 項目 | 風險 |
|------|------|
| script 順序 | 新模組必須在 `tm-utils.js`、`rev-track-diff.js` 之前 |
| `#revTrackBar` DOM | 與 Phase C 工具列其他 checkbox 衝突 |

#### `style.css`

| 項目 | 風險 |
|------|------|
| `.cat-diff-fallback-banner` 等 | 與 CAT 面板高度／rev-track 區塊樣式並改 |
| `.tm-diff-*` / `.rev-diff-*` | 尽量只读不改色票 |

#### `public/cat`

| 項目 | 風險 |
|------|------|
| 整包 mirror | 他人若手改 public 或 sync 不同步 → merge 噪音 |
| 策略 | **本計畫實作期不同步**；merge 前再跑 sync |

---

## 13. 實作前檢查

在開始修改 **任何** `cat-tool/` 執行檔之前，請依序確認：

1. **工作樹乾淨或已提交**：`git status` 無未提交變更，或已 stash；避免計畫與實作混在同一 diff。
2. **分支 rebase**：若 `app.js`、`style.css`、`index.html`、`rev-track.js`、`rev-track-diff.js`、`tm-utils.js` 在**其他分支**有進行中改動，先 merge/rebase 到實作分支，或**暫停**本工項對該檔的修改。
3. **新模組優先**：`cat-text-tokenizer.js`、`cat-diff-engine.js`、`tb-match-engine.js` 與測試可**獨立 PR**，幾乎不與他人衝突。
4. **延後 `public/cat` sync**：`cat-tool` 驗收通過後再執行 `npm run sync:cat`；實作中途不同步，減少 binary 式整包 diff。
5. **Diff 先行、TB wrapper 可延後**：若他人正在改 `app.js`，可先完成 tokenizer + diff engine + `tm-utils.js`；TB 的 `termMatches` wrapper 與 `renderLiveTmMatches` 後接。
6. **Phase C checkbox 可延後**：若他人正在改 `rev-track.js`／Phase C，先完成 diff engine 與測試；**不要**先加 `#revTrackChkFineDiff`。
7. **allowSubstring 僅 engine**：若他人正在改 TB footer／術語庫 UI，**不要**加 allowSubstring 勾選；只實作 `matchFlags.allowSubstring` 讀取與文件說明。
8. **跑測試**：每階段 `npm run test:cat`（或擴充後 vitest）+ 手動 CAT 抽查。

---

## 14. 建議拆工與避免衝突策略（多人／多工並行）

以下步驟標註 **可安全先做**（🟢） vs **易與其他改動衝突**（🔴） vs **中等**（🟡）。

| 步驟 | 內容 | 檔案 | 標記 | 說明 |
|------|------|------|------|------|
| **1** | 純新增 tokenizer + diff/TB engine + 測試 | 新 `.js` / `.test.mjs`；`vitest.config.ts`；`index.html` **僅加 script  tag** | 🟢 | 不改 app.js 行為；可先 merge |
| **2** | Diff 接入 **僅 tm-utils** | `tm-utils.js`；`updateCatTrackPanelContent` 若需 mode 可最小觸 app.js | 🟡 | CAT 比對欄 readable diff；**不**動 Phase C checkbox |
| **3** | Phase C：rev-track-diff + checkbox + style | `rev-track-diff.js`、`rev-track.js`、`index.html` `#revTrackChkFineDiff`、`style.css` | 🔴 | **等 Phase C 其他改動完成** |
| **4** | CAT 比對欄低調切換 | `#catDiffModeLink`、`style.css`、panel handler | 🟡 | 可與步驟 2 同批或緊接 |
| **5** | TB engine **app.js wrapper** | `termMatches`、`findTermHitRangesInPlainText` | 🔴 | 確認右欄、QA、AI 同一結果；**避開他人改 app.js** |
| **6** | TB inline hints | `decorateTbInlineHintsForSegId`、`pullCrossNodeWordSuffix` | 🔴 | 依賴步驟 5；虛擬捲動區易衝突 |
| **7** | surface form footer UI | `renderLiveTmMatches` footer 模板 | 🟡 | 純展示；可與步驟 6 分開 |
| **8** | allowSubstring UI（可選／後續） | TB footer、術語庫表單 | 🔴 | 第一版**不做**；僅 engine |
| **9** | `npm run sync:cat` + CODEMAP | `public/cat/**`、`docs/CODEMAP.md` | 🟡 | **全功能驗收後一次** |

### 14.1 與其他工項並行時的建議時序

```text
現在（其他改動進行中）
  → 僅 merge 步驟 1（新模組 + 測試）✅ 安全

他人改 app.js 期間
  → 步驟 2 tm-utils + 步驟 4 CAT toggle（小觸 app.js）🟡
  → 跳過步驟 5–6

他人改 Phase C 期間
  → 跳過步驟 3
  → 步驟 1–2 仍可進行

他人改 TB UI 期間
  → 步驟 5 wrapper 可做（若 app.js 可 rebase）
  → 跳過步驟 7–8 UI

全部穩定後
  → 步驟 3、5–6、9
```

---

## 附錄 A：現有呼叫點速查

### Diff

- `updateCatTrackPanelContent` → `buildTmTrackChangeStackHtml`
- `formatCatTmChangeLogForFooter` → `buildTmTargetRevisionDiffHtml`
- `rev-track.js` → `CatRevTrackDiff.renderSnapshotCell`

### TB

- `renderLiveTmMatches` — 收集 tbHits
- `decorateTbInlineHintsForSegId` — inline 底線／上標
- `_qaPushSegmentRuleFindings` — QA 術語
- AI 批次 — `termMatches` filter

---

## 附錄 B：決策紀錄（已關閉）

| 原問題 | 決定 |
|--------|------|
| TB 預設 boundary vs 舊子字串 | 預設 boundary；`matchFlags.allowSubstring` 逃生口；第一版無 UI |
| Phase C fine diff | **可見** checkbox，預設關；localStorage 共用 |
| morphology 寬度 | **保守**白名單表面形式；禁止 stem |

實作依 **§14** 拆工；**§13** 檢查通過後開始。
