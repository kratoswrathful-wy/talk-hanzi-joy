/**
 * 內部資料 — lists all configurable fields across the system with their type.
 * PM+ visible.
 */

const sections: { title: string; fields: { name: string; type: string; location: string }[] }[] = [
  {
    title: "案件管理",
    fields: [
      { name: "案件編號", type: "文字", location: "總表 / 詳情頁" },
      { name: "狀態", type: "狀態（系統）", location: "總表 / 詳情頁" },
      { name: "類型", type: "單選", location: "總表 / 詳情頁" },
      { name: "工作類型", type: "多選", location: "總表 / 詳情頁" },
      { name: "計費單位", type: "單選", location: "總表 / 詳情頁" },
      { name: "計費單位數", type: "數字", location: "總表 / 詳情頁" },
      { name: "譯者", type: "人員（多選）", location: "總表 / 詳情頁" },
      { name: "翻譯交期", type: "日期時間", location: "總表 / 詳情頁" },
      { name: "審稿人員", type: "人員（單選）", location: "總表 / 詳情頁" },
      { name: "審稿交期", type: "日期時間", location: "總表 / 詳情頁" },
      { name: "任務狀態", type: "文字", location: "總表 / 詳情頁" },
      { name: "執行工具", type: "單選", location: "詳情頁" },
      { name: "交件方式", type: "文字", location: "總表 / 詳情頁" },
      { name: "客戶收件", type: "文字", location: "詳情頁" },
      { name: "自製準則頁面", type: "URL", location: "詳情頁" },
      { name: "客戶指定準則", type: "文字", location: "詳情頁" },
      { name: "提問表單", type: "文字", location: "詳情頁" },
      { name: "填寫內部註記表單", type: "核取方塊", location: "詳情頁" },
      { name: "填寫客戶提問表單", type: "核取方塊", location: "詳情頁" },
      { name: "登入帳號 / 密碼", type: "文字", location: "詳情頁" },
      { name: "線上工具專案 / 檔名", type: "文字", location: "詳情頁" },
      { name: "追蹤修訂", type: "文字", location: "詳情頁" },
      { name: "稿費條", type: "文字", location: "詳情頁" },
    ],
  },
  {
    title: "費用管理",
    fields: [
      { name: "費用標題", type: "文字", location: "總表 / 詳情頁" },
      { name: "狀態", type: "狀態（系統）", location: "總表 / 詳情頁" },
      { name: "譯者", type: "人員（單選）", location: "總表 / 詳情頁" },
      { name: "客戶", type: "單選", location: "總表 / 詳情頁" },
      { name: "聯絡人", type: "單選", location: "詳情頁" },
      { name: "派案來源", type: "單選", location: "詳情頁" },
      { name: "工作類型", type: "多選", location: "總表 / 詳情頁" },
      { name: "計費單位", type: "單選", location: "詳情頁" },
      { name: "翻譯單價", type: "數字", location: "詳情頁" },
      { name: "審稿單價", type: "數字", location: "詳情頁" },
      { name: "營收", type: "數字（計算）", location: "總表 / 詳情頁" },
      { name: "案件 ID", type: "文字", location: "詳情頁" },
      { name: "相關案件", type: "文字", location: "總表" },
      { name: "內部備註", type: "文字", location: "詳情頁" },
      { name: "內部備註 URL", type: "URL", location: "詳情頁" },
    ],
  },
  {
    title: "稿費請款",
    fields: [
      { name: "請款單標題", type: "文字", location: "總表 / 詳情頁" },
      { name: "狀態", type: "狀態（系統）", location: "總表 / 詳情頁" },
      { name: "譯者", type: "人員（單選）", location: "總表 / 詳情頁" },
      { name: "匯款日期", type: "日期", location: "總表 / 詳情頁" },
      { name: "備註", type: "文字", location: "詳情頁" },
      { name: "收款紀錄", type: "JSON（系統）", location: "詳情頁" },
    ],
  },
  {
    title: "客戶請款",
    fields: [
      { name: "請款單標題", type: "文字", location: "總表 / 詳情頁" },
      { name: "狀態", type: "狀態（系統）", location: "總表 / 詳情頁" },
      { name: "客戶", type: "單選", location: "總表 / 詳情頁" },
      { name: "匯款日期", type: "日期", location: "總表 / 詳情頁" },
      { name: "備註", type: "文字", location: "詳情頁" },
      { name: "收款紀錄", type: "JSON（系統）", location: "詳情頁" },
    ],
  },
  {
    title: "設定中心",
    fields: [
      { name: "客戶選項", type: "單選（管理）", location: "設定頁" },
      { name: "聯絡人選項", type: "單選（管理）", location: "設定頁" },
      { name: "派案來源選項", type: "單選（管理）", location: "設定頁" },
      { name: "工作類型選項", type: "多選（管理）", location: "設定頁" },
      { name: "計費單位選項", type: "單選（管理）", location: "設定頁" },
      { name: "案件類型選項", type: "單選（管理）", location: "設定頁" },
      { name: "執行工具選項", type: "單選（管理）", location: "設定頁" },
      { name: "客戶預設報價", type: "數字（管理）", location: "設定頁" },
      { name: "標籤字色", type: "顏色", location: "設定頁" },
    ],
  },
  {
    title: "團隊成員",
    fields: [
      { name: "成員清單", type: "人員（管理）", location: "成員頁" },
      { name: "排序", type: "拖曳手把", location: "成員頁" },
      { name: "譯者備註", type: "文字及按鈕", location: "成員頁" },
      { name: "不開單", type: "核取方塊", location: "成員頁" },
      { name: "暫時凍結", type: "核取方塊", location: "成員頁" },
    ],
  },
  {
    title: "內部註記",
    fields: [
      { name: "標題", type: "文字", location: "總表 / 詳情頁" },
      { name: "關聯案件", type: "關聯", location: "詳情頁" },
      { name: "註記編號", type: "文字", location: "詳情頁" },
      { name: "性質", type: "單選", location: "詳情頁" },
      { name: "狀態", type: "單選", location: "詳情頁" },
      { name: "內部指派對象", type: "人員（單選）", location: "詳情頁" },
      { name: "檔案名稱", type: "文字", location: "詳情頁" },
      { name: "原文", type: "文字", location: "詳情頁" },
      { name: "譯文", type: "文字", location: "詳情頁" },
      { name: "問題或註記內容", type: "長文字", location: "詳情頁" },
      { name: "參考資料", type: "文字", location: "詳情頁" },
      { name: "內部處理結論", type: "長文字", location: "詳情頁" },
      { name: "備註", type: "長文字", location: "詳情頁" },
    ],
  },
];

const typeColorMap: Record<string, string> = {
  "文字": "hsl(var(--muted-foreground))",
  "長文字": "hsl(var(--muted-foreground))",
  "數字": "#60A5FA",
  "數字（計算）": "#60A5FA",
  "日期": "#A78BFA",
  "日期時間": "#A78BFA",
  "URL": "#34D399",
  "核取方塊": "#FBBF24",
  "單選": "#F87171",
  "多選": "#FB923C",
  "單選（管理）": "#F87171",
  "多選（管理）": "#FB923C",
  "人員（單選）": "#EC4899",
  "人員（多選）": "#F472B6",
  "人員（管理）": "#EC4899",
  "狀態（系統）": "#6366F1",
  "JSON（系統）": "#6366F1",
  "拖曳手把": "hsl(var(--muted-foreground))",
  "文字及按鈕": "hsl(var(--muted-foreground))",
  "顏色": "#FBBF24",
  "關聯": "#8B5CF6",
};

export default function FieldReferencePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">欄位屬性對照表</h1>
      <p className="text-sm text-muted-foreground">
        系統中所有模組的設定項目及其對應屬性類型一覽。
      </p>

      {sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <h2 className="text-base font-semibold">{section.title}</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[200px]">欄位名稱</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[160px]">屬性類型</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">位置</th>
                </tr>
              </thead>
              <tbody>
                {section.fields.map((field, idx) => (
                  <tr key={field.name} className={idx % 2 === 0 ? "" : "bg-muted/10"}>
                    <td className="px-4 py-1.5">{field.name}</td>
                    <td className="px-4 py-1.5">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: `${typeColorMap[field.type] || "hsl(var(--muted-foreground))"}20`, color: typeColorMap[field.type] || "hsl(var(--muted-foreground))" }}
                      >
                        {field.type}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-muted-foreground">{field.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
