import type { Page } from "@playwright/test";

const CAT_LOG_RE = /\[(catNav|catVirt|catFakeCaret)\]/;

export class CatConsoleCollector {
  private lines: string[] = [];

  constructor(private readonly page: Page) {
    page.on("console", (msg) => {
      const text = msg.text();
      if (CAT_LOG_RE.test(text)) {
        this.lines.push(text);
        if (this.lines.length > 200) this.lines.shift();
      }
    });
  }

  dumpRecent(limit = 50): string {
    return this.lines.slice(-limit).join("\n");
  }
}

export function attachCatConsoleCollector(page: Page): CatConsoleCollector {
  return new CatConsoleCollector(page);
}
