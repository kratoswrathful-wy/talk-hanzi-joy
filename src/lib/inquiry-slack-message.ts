import type { CaseRecord } from "@/data/case-types";

/** Collect unique translator display names from one or more cases */
export function collectTranslatorNamesFromCases(cases: CaseRecord[]): string[] {
  const set = new Set<string>();
  for (const c of cases) {
    for (const t of c.translator || []) {
      const s = t.trim();
      if (s) set.add(s);
    }
    if (c.multiCollab && c.collabRows?.length) {
      for (const r of c.collabRows) {
        const s = (r.translator || "").trim();
        if (s) set.add(s);
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

export interface InquiryCaseLine {
  id: string;
  title: string;
  url: string;
}

export function buildInquiryCaseLines(origin: string, cases: Pick<CaseRecord, "id" | "title">[]): InquiryCaseLine[] {
  return cases.map((c) => ({
    id: c.id,
    title: c.title || "（無標題）",
    url: `${origin.replace(/\/$/, "")}/cases/${c.id}`,
  }));
}

/** Plain text inquiry message (same rules as CaseDetailPage「產生詢案訊息」) */
export function buildInquiryMessagePlainText(origin: string, cases: Pick<CaseRecord, "id" | "title">[]): string {
  const lines = buildInquiryCaseLines(origin, cases);
  const body = lines.map((l) => `${l.title}（${l.url}）`).join("\n");
  if (lines.length <= 1) {
    return `請問這件可以做嗎？\n${body}`;
  }
  return `請問這幾件可以做嗎？\n${body}`;
}
