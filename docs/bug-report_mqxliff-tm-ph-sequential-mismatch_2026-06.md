# Bug Report：mqxliff TM 連續 ph 佔位錯位（Bug #11）

> 建立：2026-06-09  
> 狀態：**待修**  
> 相關：[`bug-report_mqxliff-bpt-ph-type-mismatch_2026-06.md`](bug-report_mqxliff-bpt-ph-type-mismatch_2026-06.md)（Bug #10）、[`bug-report_mqxliff-tag-issues.md`](bug-report_mqxliff-tag-issues.md)、[`CAT_MQXLIFF_TM_FIX_IMPLEMENTATION_PLAN.md`](CAT_MQXLIFF_TM_FIX_IMPLEMENTATION_PLAN.md) 階段 J

---

## 1. 現象

樣本：`53905_02_JSON_JadeChampsItemsBatch5B_v1_zh_TW.json_zho-TW.mqxliff`

| `trans-unit` | 譯文 `<target>` 結構 | 匯入後 pill 顏色 |
|--------------|----------------------|------------------|
| **id="1"`、**id="4"** | TM 模糊匹配：**全部 `<ph>`**（非 bpt/ept） | 多顆**橘**（譯文 extra）／原文**紅**（missing） |
| **id="2"`、**id="3"** | 譯者提交：**bpt/ept 成對** | 多數**藍**（正常） |

使用者感受：「檔案裡譯文 tag 看起來對，匯入後卻與原文對不上」— 且**不是每列**皆然。

**與 Bug #10 的差異**：Bug #10 修的是「同編號 `{N}` 的 bpt vs ph 型別」；本 bug 是 TM 把成對 tag **拆成連續 standalone ph**，導致 `{1}{2}{3}…` 與原文 `{1}{/1}{2}{/2}…` **錯位**。

---

## 2. 根因

### 2.1 譯文 XML（tu id=1 範例）

**原文**（bpt/ept）：

```text
{bpt titleLeft} Conduit {ept} {bpt mainText} … {ept} {bpt postScriptLeft} Source: {ph @SourceName@} {ept}
```

**譯文**（TM 89% 模糊匹配，全 ph）：

```text
{ph titleLeft open} 能量護盾 {ph titleLeft close} {ph mainText open} … {ph mainText close} … 來自：{ph postScriptLeft close}
```

（實際 XML 見樣本 `<target>`；且譯文**缺** `@SourceName@` 的 ph。）

### 2.2 `extractTaggedText` 對 `<ph>` 的編號

[`xliff-tag-pipeline.js`](../cat-tool/js/xliff-tag-pipeline.js)（約 111–136 行）：每遇到一個 `<ph>` 就 `counter++` → `{1}`, `{2}`, `{3}`… **皆 `type: 'standalone'`**。

close 的 `</titleLeft>` **不會**變成 `{/1}`，而是下一顆 `{2}`。

### 2.3 Bug #10 為何擋不住

[`fixMqxliffBptPhTypeMismatch`](../cat-tool/js/xliff-build-segments.js)（282–318 行）以 `sourceByPh.get(tt.ph)` 對位：

- 僅當譯文 `{N}` **恰好等於**原文 **open `{N}`** 且 `innerEscapedTagSig` 相同 → 覆寫為 bpt。
- 譯文 `{2}` 是 `</titleLeft>` close，原文 `{2}` 是 `<mainText>` **open** → 簽名不同 → **跳過**。
- 後續 `{3}`～`{6}` 連鎖錯位。

### 2.4 橘／紅色是否為 regression？

[`updateTagColors`](../cat-tool/app.js)（19175–19294 行）依 `buildTagTokenSequence` 的 xml 簽名比對。結構錯位時顯示橘／紅為**正確反映**，非比色邏輯壞掉。

---

## 3. 修正方案

### 3.1 新增 `fixMqxliffTmPhSequentialPairs`

**檔案**：[`xliff-build-segments.js`](../cat-tool/js/xliff-build-segments.js)  
**時機**：`mergePartialTargetTagsFromSource` 之後；與 `fixMqxliffBptPhTypeMismatch` 串成**兩階段**（建議 **先 #11 再 #10**，或 #11 吸收 #10 的單顆對齊後 #10 僅補 close）。

**觸發條件**（保守）：

1. `isMqxliffFile`；
2. `sourceTags` 含 `open` + `close` 成對；
3. `targetTags` 幾乎全為 `standalone`（譯文 target XML 無 bpt/ept 或僅極少數）。

**配對邏輯**：

1. 依譯文 `targetTags` **出現順序**走訪；
2. [`extractMqRxtDisplayText`](../cat-tool/js/xliff-tag-pipeline.js) 判斷 open（如 `<titleLeft>`）vs close（`</titleLeft>`）；
3. 與原文依 `pairNum` 的 open/close 序列對齊；`innerEscapedTagSig` 一致時，以 source 的 `type`／`ph`／`xml` 覆寫 target 條目；
4. **同步 `targetText`**：佔位由 `{1}{2}{3}…` 改為 `{1}{/1}{2}{/2}…`（與 `targetTags` 一致），否則 pill／QA／F8 仍錯。

**邊界**：

- 譯文**缺 tag**（如 `@SourceName@`）：**不**憑空插入；原文 `{4}` 可仍紅。與 Bug #5 部分 `targetTags` 互補。
- 已為 bpt/ept 的句段（tu id=2、3）：**不觸發**。

### 3.2 與 Bug #10 文件修正

Bug #10 驗收「tu id=1 open 藍」在 Bug #11 未修前**不成立**（close 仍橘、整列錯位）。修 Bug #11 後再驗收完整成對藍色。

---

## 4. 驗收步驟

1. **重匯** JSON 樣本；`trans-unit id="1"`：譯文 `{1}{/1}{2}{/2}…` 與原文同編號，成對 pill **藍色**（缺 `@SourceName@` 時原文 `{4}` 仍可紅）。
2. `id="2"` 迴歸：仍全藍。
3. `id="4"`（同為全 ph TM 列）：與 id=1 同類修正。
4. F8／匯出 mqxliff：結構可讀；Bug #9 迴歸。
5. displaytext 三模式仍正確。

---

## 5. 程式觸點

| 符號 | 檔案 |
|------|------|
| `fixMqxliffTmPhSequentialPairs`（待新增） | `xliff-build-segments.js` |
| `extractMqRxtDisplayText` | `xliff-tag-pipeline.js` |
| `innerEscapedTagSig` | `xliff-tag-pipeline.js` |
| `updateTagColors`（不需改，驗證用） | `app.js` |

變更 `cat-tool/` 後執行 `npm run sync:cat`。

---

## 6. 狀態

| 項目 | 狀態 |
|------|------|
| 本文件 | 規格 |
| `fixMqxliffTmPhSequentialPairs` | **待實作** |
