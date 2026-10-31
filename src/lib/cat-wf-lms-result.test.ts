import { describe, expect, it } from "vitest";
import {
  CAT_WF_LMS_RESULT_TYPE,
  catWfLmsResultMessage,
  parseCatWfLmsRequestId,
} from "./cat-wf-lms-result";

describe("catWfLmsResultMessage", () => {
  it("成功時不帶錯誤字", () => {
    expect(catWfLmsResultMessage(" abc ", true, "ignored")).toEqual({
      type: CAT_WF_LMS_RESULT_TYPE,
      payload: { requestId: "abc", ok: true, error: "" },
    });
  });

  it("失敗時保留原因，空編號仍可組訊息", () => {
    expect(catWfLmsResultMessage("", false)).toEqual({
      type: CAT_WF_LMS_RESULT_TYPE,
      payload: { requestId: "", ok: false, error: "lms_sync_failed" },
    });
  });
});

describe("parseCatWfLmsRequestId", () => {
  it("只接受字串編號", () => {
    expect(parseCatWfLmsRequestId({ requestId: " r1 " })).toBe("r1");
    expect(parseCatWfLmsRequestId(null)).toBe("");
  });
});
