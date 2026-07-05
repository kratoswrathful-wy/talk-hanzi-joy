# CAT 追蹤修訂 Diff v2 ＋ TB Match Engine v2 — 技術變更計畫

**狀態**：規劃中（待專案擁有者確認後始可實作）  
**日期**：2026-07-05  
**範圍**：`cat-tool/`（Vanilla CAT）；不含 DB migration  
**前置文件**：[`CAT_REVISION_TRACKING_PHASE_C_SPEC_2026-06.md`](./CAT_REVISION_TRACKING_PHASE_C_SPEC_2026-06.md)、[`CAT_TB_DEDUP_AND_SUPPRESS_2026-06.md`](./CAT_TB_DEDUP_AND_SUPPRESS_2026-06.md)

---

## 摘要

本計畫一次規劃兩項子功能：

| 代號 | 問題 | 目標 |
|------|------|------|
| **A. Diff v2** | 追蹤修訂與 CAT 比對欄以**字元級 LCS** 顯示差異，英文單字被切碎 | 共用 **readable token diff**；保留 fine-grained char diff 為可選 |
| **B. TB Match v2** | `termMatches` 預設 `wholeWord: false` → 子字串誤命中（Layer→player） | 統一 **token boundary + 英文詞形** 比對入口；CJK 維持子字串 |

兩者共用 **`cat-text-tokenizer.js`**（切 token／atomic 判斷／語言正規化），但 **diff engine 與 TB engine 各自獨立**，互不 import renderer 或比對 UI。

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

**譯文側**「是否已套用譯法」仍用 `termMatches(tgtPlain, term.target, mf)`；v2 主要改**原文命中**與 **ranges**；譯文側可沿用或同步升級（見 §6.2）。

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
| **`tb-match-engine.js`** | `findTbTermRanges`、`termMatchesV2`、`matchTermInHaystack` |
| **`tb-match-engine.test.mjs`** | 驗收案例回歸 |

### 3.2 重構（薄包裝，行為遷至新模組）

| 檔案 | 變更 |
|------|------|
| **`tm-utils.js`** | `diffCharsCurrentVsTm` → 委派 `CatDiffEngine`；保留 window 別名；`buildTm*` 改用統一 render |
| **`rev-track-diff.js`** | 移除重複 LCS；`renderSnapshotCell` 改用 `CatDiffEngine` + tag token 適配層 |
| **`app.js`** | `termMatches` / `findTermHitRangesInPlainText` → 薄 wrapper 呼叫 `TbMatchEngine`；呼叫點**不換名**（降低 diff 面積） |
| **`index.html`** | 在 `tm-utils.js` **之前**載入 `cat-text-tokenizer.js`、`cat-diff-engine.js`、`tb-match-engine.js` |

### 3.3 樣式

| 檔案 | 變更 |
|------|------|
| **`style.css`** | 新增 `.cat-diff-fallback-banner`、可選 `.cat-diff-mode-toggle`；必要時統一 del/ins 色票 alias |

### 3.4 文件（實作後）

| 檔案 | 時機 |
|------|------|
| **`docs/CODEMAP.md`** | 驗收後記現況 |
| 本檔 | 驗收後標「已驗收，細節以程式為準」 |

### 3.5 不在本次修改

- TM 相似度 `levenshtein`（`tm-utils.js`）
- TB 合併／隱藏／footer UI 邏輯（僅換底層命中）
- Supabase／Dexie schema
- `public/cat/`（`npm run sync:cat` 自動同步）

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

#### `options`

| 欄位 | 說明 |
|------|------|
| `tags` | XLIFF tag 陣列 → 以 `pos` 切出 `{N}` pill 位置為 `kind:'tag'` |
| `lang` | 影響 CJK 連續切分 vs 拉丁規則 |
| `includeWhitespace` | diff 用：是否獨立 whitespace token（預設 true，保留排版） |

#### Token 結構

```javascript
{ kind, value, start, end, meta? }
// kind: 'latin'|'number'|'unit'|'cjk'|'placeholder'|'tag'|'url'|'email'|'filename'|'key'|'punct'|'space'|'other'
```

### 4.2 Tokenization 規則（第一版）

掃描順序（長模式優先）：

1. **Placeholder**：`\{[^{}]+\}`、`%\d*[sdif]`、`%\([^)]+\)[sdif]`、`\{(\d+)\}`（與既有 pill 占位一致）
2. **URL**：`https?://…`、`www.…`
3. **Email**：簡化 RFC 子集
4. **XML/HTML tag 字面量**：`<[^>]+>`（diff／TB 對 plain text 比對時）
5. **識別 key**：`[A-Z][A-Z0-9_]{2,}`（`UI_BUTTON_START_GAME`）、可選 `snake_case` 全段
6. **數字+單位**：`(\d+(?:\.\d+)?)(%|[a-zA-Z]{1,6})?` → 盡量合併為單 token（`15%`、`3.5s`、`120 HP`）
7. **CJK 連續串**：`\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}` 連續（Unicode property；不逐字切）
8. **拉丁詞**：`[A-Za-z]+(?:'[A-Za-z]+)?`（含 `don't`）
9. **底線檔名**：含 `.` 與 `\w` 的檔名樣式（`foo_bar.txt`）
10. **其餘**：空白獨立；標點單獨或相鄰同類合併

**Atomic 不可拆**：placeholder、tag、url、email、filename、key、number+unit 整段。

### 4.3 語言正規化

```javascript
function normalizeLangCode(lang) {
  // EN, en, EN_US, en-us, en_US, en-GB … → 'en'
  // zh*, ja*, ko* → 對應碼
  // 其他拉丁語系（fr, de, es…）→ 'latin'
  // 空值 → 'und'
}
function isEnglishSourceLang(lang) {
  return normalizeLangCode(lang) === 'en';
}
```

來源語言讀取優先序：`window.ActiveFileLangs.sourceLang` → 句段 `sourceLang` → 專案 `sourceLangs[0]`。

---

## 5. Diff Engine v2 設計

### 5.1 模組：`window.CatDiffEngine`

```javascript
computeDiff(oldText, newText, options?)     // → DiffOp[]
renderDiffHtml(oldText, newText, options?)   // → HTML string
renderTrackStackHtml(oldText, newText, options?)  // 三列 TM 追蹤
renderInlineMergedHtml(oldText, newText, options?) // 單行（譯文更新紀錄）

// DiffOp: { type: 'equal'|'delete'|'insert', text, tokens?, tokenKind? }
```

#### `options`

| 欄位 | 預設 | 說明 |
|------|------|------|
| `mode` | `'readable'` | `'readable'` \| `'char'` |
| `tagsOld` / `tagsNew` | — | Phase C／tag-aware diff |
| `semantics` | `'current-vs-reference'` | TM 面板用；Phase C 用 `'old-vs-new'` 映射 class |
| `maxTokens` | 4000 | 超過則 fallback |
| `fallbackRatio` | 0.55 | 變更 token 占比超過 → 大幅修改 UI |
| `classDel` / `classIns` | 依 semantics 選 tm 或 rev class | 統一 render 規則 |

### 5.2 Readable diff 演算法

1. `oldTokens = tokenizeForCatText(old)`、`newTokens = tokenize(...)`（**同 tokenizer**）
2. 對 atomic token：LCS 在 **token 序列**上比對（value 相等即 equal；tag 可比 `display`+`ph`）
3. 非 atomic 且 mode=`char`：該 token 內部可降級字元 LCS（僅 fine 模式）
4. **英文拉丁詞**：readable 模式下整 token 替換（不拆 `degraded`/`degrade` 共用 `de`）
5. **CJK token**：整段替換；僅 fine 模式才 intra-token char diff
6. 合併相鄰同 type ops → `mergeDiffOps`

### 5.3 大幅修改 Fallback

當 `changedTokens / max(len(old), len(new)) > fallbackRatio` 或 token 數 > `maxTokens`：

```html
<div class="cat-diff-fallback-banner">本句修改幅度較大，以下為上下對照</div>
<div class="cat-diff-fallback-old">…escape old…</div>
<div class="cat-diff-fallback-new">…escape new…</div>
```

TM 三列 stack 仍可保留 row1/row3 純文字，row2 改 banner + 雙列或省略 inline merge。

### 5.4 Fine-grained / char diff 切換

| UI 位置 | 控制 |
|---------|------|
| Phase C `revTrackBar` | 新增「精細 diff」checkbox（`revTrackChkFineDiff`），預設**關** |
| CAT 比對追蹤區 | 可選小連結「字元級 diff」；預設 readable |
| 持久化 | `localStorage catDiffMode = 'readable'|'char'`（可選） |

### 5.5 統一 render 規則

| 語意 | delete 樣式 | insert 樣式 |
|------|-------------|-------------|
| TM 追蹤（current vs TM） | `.tm-diff-cur-only` 新側独有 | `.tm-diff-tm-only` 舊側独有 |
| Phase C／譯文更新（old vs new） | `.rev-diff-del` | `.rev-diff-ins` |

**色票維持現有**（紅刪除、藍新增），避免使用者重新適應。

### 5.6 `rev-track-diff.js` 遷移策略

- 保留 `CatRevTrackDiff` 公開面（`renderSnapshotCell`、`tokenizeWithTags` 可 thin-wrap）
- `tokenizeWithTags` 改呼叫 `CatTextTokenizer` + tags 選項
- 刪除重複 `computeCharDiff`；char 模式委派 `CatDiffEngine` `mode:'char'`

### 5.7 `tm-utils.js` 遷移策略

- `diffCharsCurrentVsTm` 保留為 alias → `CatDiffEngine.computeDiff(..., { mode: 'char' })`（向後相容測試／外部腳本）
- `buildTmTrackChangeStackHtml` / `buildTmTargetRevisionDiffHtml` 改呼叫 `renderTrackStackHtml` / `renderInlineMergedHtml`

---

## 6. TB Match Engine v2 設計

### 6.1 模組：`window.TbMatchEngine`

```javascript
findTbTermRanges(text, term, options?)   // → { start, end, matchedText }[]
termMatches(haystack, needle, flags, options?)  // boolean
matchTermInHaystack(haystack, needle, flags, options?) // { matched, ranges, surfaceForms? }
expandEnglishTermVariants(term)          // 英文詞形候選（內部）
```

#### `options`

| 欄位 | 預設 | 說明 |
|------|------|------|
| `sourceLang` | `ActiveFileLangs.sourceLang` | 決定英文 morphology |
| `flags` | `{ caseInsensitive: true, wholeWord: false }` | 保留既有 TB 設定 |
| `forTargetSide` | false | 譯文比對時語言規則（通常 targetLang） |

### 6.2 比對策略矩陣

| 來源語言 | 拉丁/數字術語 | 片語（含空白） | CJK 術語 |
|----------|---------------|----------------|----------|
| **英文** (`isEnglishSourceLang`) | token boundary + **英文詞形** | token-by-token morphology | N/A |
| **其他拉丁** | token boundary only | 逐 token 相等（case 依 flags） | N/A |
| **中文/日/韓** | 不套用英文詞形 | 維持 **子字串包含** + 長詞優先 | 同左 |
| **全部** | placeholder/tag/url/email/key **內部禁止命中** | | |

#### Token boundary（非 CJK）

- 術語與原文皆先 `tokenizeForCatText`
- 命中須對齊 **完整 token 邊界**（`start`/`end` 與 token 邊界一致）
- `wholeWord: true`（TB「精確比對」）：維持更嚴格邊界，且不跨 token
- **`wholeWord: false` 新預設行為**：仍要求 token boundary（**不再** `includes` 子字串）— 這是 v2 **行為變更**核心

#### 英文 Morphology（第一版：規則型，無外部 NLP 庫）

對**單 token 術語**產生表面形式候選：

- 複數：`-s`, `-es`, `-ies`（`Boundary→Boundaries`, `Game→Games`）
- 動詞：`-s`, `-ed`, `-ing`（`Apply→applies/applied/applying`）
- 形容詞比較級不在第一版

對**多 token 片語**（`Game Mode`）：

- 逐 token 產生變形集合，笛卡爾組合**僅限相鄰 token 一一對應**（不爆炸）
- 例：`Game Mode` 可命中 `Game Modes`；`Boundary Layer` → `Boundary Layers`

比對：在原文 token 序列上滑動窗口，窗口長度 = 術語 token 數；每 slot 比對「術語 token 變形集 vs 原文 token 正規化後表面形」。

**Lemma 正規化（簡化）**：小寫 + 剝離常見 suffix 得 stem；stem 相等即視為詞形命中。

### 6.3 `termMatches` 向後相容

```javascript
// app.js — 保留函式名，內部委派
function termMatches(haystack, needle, flags) {
  return TbMatchEngine.termMatches(haystack, needle, flags, {
    sourceLang: getActiveSourceLang(),
  });
}
function findTermHitRangesInPlainText(text, needle, flags) {
  return TbMatchEngine.findTbTermRanges(text, needle, { flags, sourceLang: getActiveSourceLang() });
}
```

**譯文側**（target 是否含譯法）：使用 `targetLang`；CJK 譯文仍可用子字串；英文譯文可選 token boundary（第一版：譯文側維持現有 `termMatches` 邏輯，降低 scope；若 QA 誤報再同步）。

### 6.4 命中表面形式（UI）

右欄 TB footer／比對列 metadata 新增（當命中變形時）：

```text
Game → 遊戲
命中：Games
```

實作：`matchTermInHaystack` 回傳 `surfaceForm`；`renderLiveTmMatches` footer 模板增加一行。

### 6.5 與既有後處理銜接

```text
findTbTermRanges (v2)
  → tbHits + ranges + matchedText
  → shouldSuppressTbHit（不變）
  → groupBy / dedupe / hidden filter（不變）
  → decorateTbInlineHints（ranges 改 token 對齊；pullCrossNodeWordSuffix 改讀 tokenizer 邊界）
```

**Card/card**：壓制仍靠 `isTbSourceStrictSubstring` **嚴格大小寫**；v2 邊界比對不應合併兩者。

**Mark Anthony / Anthony**：長詞壓短詞僅在 **合法命中** 後執行；句中另一獨立 `Anthony` 無 `Mark Anthony` range 涵蓋 → 仍顯示。

### 6.6 `{player_name}` 與 placeholder

- Tokenizer 將 `{player_name}` 標為 atomic
- `findTbTermRanges` 跳過 `kind === 'placeholder'|'tag'` 的 token 內部
- `Layer` 不得命中 `player` 子串；亦不得命中 placeholder 內文字

---

## 7. 兩者如何共用 tokenization，但保持模組獨立

```text
                    cat-text-tokenizer.js
                    (tokenize, atomic, lang)
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
   cat-diff-engine.js              tb-match-engine.js
   (LCS, render, fallback)         (ranges, morphology)
           │                               │
           ▼                               ▼
   tm-utils.js / rev-track-diff.js   app.js wrappers
   (CAT 面板 + Phase C UI)           (右欄/TB inline/QA/AI)
```

**依賴規則**

- `cat-text-tokenizer.js`：**零依賴**其他 CAT 模組
- `cat-diff-engine.js`：僅 import tokenizer
- `tb-match-engine.js`：僅 import tokenizer
- **禁止** diff → tb 或 tb → diff
- **禁止** tokenizer 依賴 diff/tb

---

## 8. 可能風險與回歸點

| 風險 | 影響 | 緩解 |
|------|------|------|
| 英文 morphology 過寬／過窄 | 漏命中或誤命中 | 規則表 + 驗收案例鎖定；可 per-term 關閉（flags 保留） |
| 非英文拉丁語系被誤套英文變形 | 法文等誤命中 | 以 `isEnglishSourceLang` 閘門；其他 latin 僅 boundary |
| CJK 行為變更 | 使用者依賴子字串 | CJK **明確維持** contains；加測試 |
| TB `wholeWord:false` 語意變更 | 舊專案依賴子字串命中 | 產品決定：v2 預設改 boundary；必要時 flags 加 `allowSubstring` 舊模式 |
| Phase C 大檔 diff 效能 | token LCS O(n·m) | 沿用 lazy 渲染；超 `maxTokens` fallback |
| inline TB 與 `rt.textContent` 偏移 | 底線錯位 | ranges 必須對 **plain text** 與 DOM text node 一致；tag pill 仍 skip |
| Card/card 回歸 | 誤壓制 | 保留 strict substring 五條件；加案例 |
| QA 與右欄不一致 | 隱藏術語仍 QA 報 | 規格已如此；v2 不改 |
| `public/cat` 漏 sync | 部署舊版 | 每 commit 跑 `npm run sync:cat` |
| Vitest 預設不含 cat-tool | 測試漏跑 | 新增 `*.test.mjs` + 擴充 vitest `include` 或 npm script `test:cat` |

---

## 9. 驗收案例清單

### 9.1 Diff v2

| # | 輸入 | 預期（readable 模式） |
|---|------|------------------------|
| D1 | `degraded` → `degrade` | 整詞 delete + 整詞 insert，不僅 `ed` |
| D2 | `will degrade` → `will not degrade` | `not ` 為 insert token；`degrade` 保持 equal |
| D3 | `15%` → `20%` | 整段 `15%` delete、`20%` insert（或 number+unit 各一 token） |
| D4 | `3.5s` → `4s` | 數字+單位整 token 替換 |
| D5 | `{player_name}` → `{user_name}` | 各 placeholder 整段 del/ins，不拆內部 |
| D6 | `<b>Start</b>` → `<strong>Start</strong>` | tag/字面量 atomic；`Start` 可 equal |
| D7 | `UI_BUTTON_START_GAME` → `UI_BUTTON_BEGIN_GAME` | key token 整段替換 |
| D8 | 中文句局部修改 | CJK 連續 token 替換，非逐字紅藍碎裂 |
| D9 | 全文改寫 >55% token | 顯示「本句修改幅度較大」+ 上下對照 |
| D10 | CAT 追蹤面板 vs footer 譯文更新 | **同一** diff engine；class 依 semantics 不同 |
| D11 | Phase C 追蹤修訂模式 | 與 CAT 面板 readable 規則一致；勾「精細 diff」→ char |
| D12 | 含 XLIFF tag pill 句段 | tag 整 pill del/ins，不拆 display 字元 |

### 9.2 TB Match v2

| # | 原文 | 術語 | 預期 |
|---|------|------|------|
| T1 | `player` | `Layer` | **不命中** |
| T2 | `Layer.` | `Layer` | 命中（標點外 boundary） |
| T3 | `Layers` | `Layer` | 命中（英文複數） |
| T4 | `permission` | `Sion` | **不命中** |
| T5 | `humiliation` | `lat` | **不命中** |
| T6 | `Games` | `Game` | 命中 |
| T7 | `Boundaries` | `Boundary` | 命中 |
| T8 | `applies` / `applied` / `applying` | `Apply` | 命中 |
| T9 | `unlocks` / `unlocked` / `unlocking` | `Unlock` | 命中 |
| T10 | `Game Modes` | `Game Mode` | 命中 |
| T11 | `Power Utilities` | `Power Utility` | 命中 |
| T12 | `Mark Anthony … Anthony` | `Mark Anthony` + `Anthony` | 前者壓制後者**僅 Mark Anthony 範圍內**；句中另一 `Anthony` 仍命中 |
| T13 | `Card` vs `card` 兩 TB | 各別 | **兩列**，無誤壓制 |
| T14 | `{player_name}` | `Layer` / `player` | **不命中** placeholder 內 |
| T15 | 右欄／原文底線／QA／AI 批次 | 同句 | **同一**命中結果（AI 為 filter 後子集） |

### 9.3 測試落地

- Pure：`cat-tool/js/cat-diff-engine.test.mjs`、`tb-match-engine.test.mjs`
- Vitest：擴充 `vitest.config.ts` `include` 或 `npm run test:cat`
- 手動：CAT 編輯器開檔 → 右欄 + 原文上標 + QA + AI 批次預覽

---

## 10. 建議實作順序

1. **`cat-text-tokenizer.js`** + 單元測試（token 邊界、atomic、lang normalize）
2. **`cat-diff-engine.js`** readable LCS + fallback + render；接 `tm-utils.js`
3. **Phase C** `rev-track-diff.js` 遷移 + fine diff toggle
4. **`tb-match-engine.js`** boundary + CJK 分支 + placeholder 跳過
5. **英文 morphology** + 片語窗口比對
6. **`app.js` 薄 wrapper** + `renderLiveTmMatches` surface form UI
7. **`decorateTbInlineHints`** 對齊 token ranges + `pullCrossNodeWordSuffix` 調整
8. **CSS** fallback banner + 文件更新
9. **`npm run sync:cat`** + 全量驗收

---

## 11. 建議拆 commit 方式

| 順序 | Commit 訊息（建議） | 內容 |
|------|---------------------|------|
| 1 | `feat(cat): add shared text tokenizer for diff and TB` | `cat-text-tokenizer.js` + tests + index.html script |
| 2 | `feat(cat): diff engine v2 with readable token diff` | `cat-diff-engine.js` + tm-utils 接入 + tests |
| 3 | `refactor(cat): unify Phase C rev-track diff on diff engine v2` | `rev-track-diff.js` + bar toggle + tests |
| 4 | `feat(cat): TB match engine v2 with token boundaries` | `tb-match-engine.js` + app wrappers + CJK/boundary tests |
| 5 | `feat(cat): English morphology for TB phrase matching` | morphology + 片語 + surface form UI |
| 6 | `fix(cat): align TB inline hints with token-based ranges` | decorateTbInlineHints + pullCrossNodeWordSuffix |
| 7 | `style(cat): diff fallback banner and docs` | CSS + CODEMAP + 本檔狀態更新 |
| 8 | `chore(cat): sync public/cat` | `npm run sync:cat` 產物 |

**原則**：tokenizer → diff → TB boundary → morphology → UI 整合 → sync；每 commit 可獨立過測試，避免巨型 PR。

---

## 附錄 A：現有呼叫點速查

### Diff

- `updateCatTrackPanelContent` → `buildTmTrackChangeStackHtml`
- `formatCatTmChangeLogForFooter` → `buildTmTargetRevisionDiffHtml`
- `rev-track.js` → `CatRevTrackDiff.renderSnapshotCell`

### TB

- `renderLiveTmMatches` — 收集 tbHits
- `decorateTbInlineHintsForSegId` — inline 底線／上標
- `updateTbInlineMissingStateForRow` — 譯文缺失狀態
- `_qaPushSegmentRuleFindings` — QA 術語
- `_buildAiOptions` / 批次 filter — AI 術語子集
- `liveFooterContent` TB 編輯 — 不直接比對，但顯示 `matchFlags`

---

## 附錄 B：需您確認的決策點

1. **TB v2 預設改 token boundary**（即使「精確比對」未勾）：是否接受舊專案可能少命中 intentionally substring 的術語？
2. **Phase C 是否加「精細 diff」toggle**，或僅 hidden `localStorage`？
3. **英文 morphology 第一版**是否允許少量誤命中（例如 `apply` 命中 `application`）— 若不行需加「完整 token 相等優先、stem 僅限已知 suffix 表」。

確認後依 §10 順序實作。
