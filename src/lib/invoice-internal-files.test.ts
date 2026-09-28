import { describe, expect, it } from "vitest";
import {
  invoiceInternalFilePathFromRef,
  isInvoiceInternalFileRef,
  toInvoiceInternalFileRef,
} from "./invoice-internal-file-refs";

describe("invoice-internal-files refs", () => {
  it("只把內部參照當內部，不把公開網址當內部", () => {
    expect(isInvoiceInternalFileRef("invoice-internal:invoice-internal/a/b.png")).toBe(true);
    expect(isInvoiceInternalFileRef("https://example.test/case-files/a.png")).toBe(false);
    expect(invoiceInternalFilePathFromRef("invoice-internal:invoice-internal/a/b.png")).toBe(
      "invoice-internal/a/b.png",
    );
    expect(toInvoiceInternalFileRef("invoice-internal/a/b.png")).toBe(
      "invoice-internal:invoice-internal/a/b.png",
    );
  });
});
