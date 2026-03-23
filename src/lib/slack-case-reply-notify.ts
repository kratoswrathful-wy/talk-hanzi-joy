import { supabase } from "@/integrations/supabase/client";
import { getAccessTokenForEdgeFunctions } from "@/lib/supabase-access-token";
import { messageFromFunctionsInvokeErrorAsync } from "@/lib/functions-invoke-error";
import {
  effectiveAcceptSuffix,
  effectiveDeclineLine1Suffix,
  effectiveDeclineLine2Suffix,
  effectiveDeclineLine3Suffix,
} from "@/lib/slack-case-reply-defaults";
import { toast } from "@/hooks/use-toast";

/** Slack does not allow &, <, > in link label text — strip/replace for display. */
function sanitizeSlackLinkLabel(text: string): string {
  return text
    .replace(/&/g, "＆")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .replace(/\|/g, "｜");
}

function buildCaseUrl(caseId: string): string {
  if (typeof window === "undefined") return "";
  const base = window.location.origin.replace(/\/$/, "");
  return `${base}/cases/${caseId}`;
}

function formatDeadlineZh(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type DeclineFieldsForSlack = {
  proposedDeadline?: string | null;
  availableCount?: number | undefined;
  message?: string | undefined;
};

function buildAcceptMrkdwn(caseId: string, caseTitle: string, slackDefaults: unknown): string {
  const url = buildCaseUrl(caseId);
  const label = sanitizeSlackLinkLabel(caseTitle.trim() || "案件");
  const link = `<${url}|${label}>`;
  const suffix = effectiveAcceptSuffix(slackDefaults);
  return `${link}${suffix}`;
}

function buildDeclineMrkdwn(
  caseId: string,
  caseTitle: string,
  slackDefaults: unknown,
  decline: DeclineFieldsForSlack,
): string {
  const url = buildCaseUrl(caseId);
  const label = sanitizeSlackLinkLabel(caseTitle.trim() || "案件");
  const link = `<${url}|${label}>`;
  const line1 = `${link}${effectiveDeclineLine1Suffix(slackDefaults)}`;

  const lines: string[] = [line1];
  const dl = formatDeadlineZh(decline.proposedDeadline ?? null);
  if (dl) {
    lines.push(`${dl}${effectiveDeclineLine2Suffix(slackDefaults)}`);
  }
  if (decline.availableCount != null && !Number.isNaN(decline.availableCount)) {
    lines.push(`${decline.availableCount} 字${effectiveDeclineLine3Suffix(slackDefaults)}`);
  }
  const msg = decline.message?.trim();
  if (msg) lines.push(msg);

  return lines.join("\n");
}

function plainFallbackFromMrkdwn(mrkdwn: string): string {
  const first = mrkdwn.split("\n")[0] ?? "";
  const pipe = first.indexOf("|");
  const close = first.lastIndexOf(">");
  if (first.startsWith("<http") && pipe > 0 && close > pipe) {
    const title = first.slice(pipe + 1, close);
    const rest = first.slice(close + 1).trim();
    return `${title}${rest ? " " + rest : ""}`.slice(0, 300);
  }
  return mrkdwn.slice(0, 300);
}

/**
 * If the user has linked Slack, notify PM/Executive via edge function (translator identity).
 * No-op when not linked; toasts on hard errors only.
 */
export async function maybeSendTranslatorCaseReplySlack(params: {
  userId: string;
  slackMessageDefaults: unknown;
  caseId: string;
  caseTitle: string;
  kind: "accept" | "decline";
  decline?: DeclineFieldsForSlack;
}): Promise<void> {
  const { userId, slackMessageDefaults, caseId, caseTitle, kind, decline } = params;

  const { data: meta } = await supabase
    .from("user_slack_meta")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!meta) return;

  const token = await getAccessTokenForEdgeFunctions();
  if (!token) return;

  const message =
    kind === "accept"
      ? buildAcceptMrkdwn(caseId, caseTitle, slackMessageDefaults)
      : buildDeclineMrkdwn(caseId, caseTitle, slackMessageDefaults, decline || {});

  const notification_fallback = plainFallbackFromMrkdwn(message);

  const { data, error } = await supabase.functions.invoke("slack-send-dm", {
    headers: { Authorization: `Bearer ${token}` },
    body: {
      case_reply_notification: true,
      message,
      notification_fallback,
    },
  });

  if (error) {
    toast({
      title: "Slack 通知未送出",
      description: await messageFromFunctionsInvokeErrorAsync(error, data),
      variant: "destructive",
    });
    return;
  }

  const payload = data as {
    ok?: boolean;
    skipped?: string;
    results?: { email: string; ok: boolean; error?: string }[];
  };

  if (payload?.skipped === "no_recipients_after_filter") {
    toast({
      title: "Slack 通知已略過",
      description:
        "沒有可接收的派案端：請確認至少一位 PM／執行長已在「個人檔案」連結 Slack，並開啟「接收承接／無法承接自動 Slack 私訊」。",
    });
    return;
  }

  const results = payload?.results ?? [];
  const failed = results.filter((r) => !r.ok);
  const anyOk = results.some((r) => r.ok);

  /** Slack users.lookupByEmail — email not in workspace or not a full member */
  const isSlackUserLookupFailure = (err?: string) => {
    const e = (err ?? "").toLowerCase();
    return e === "users_not_found" || e === "user_not_found";
  };

  const failedLookupOnly =
    failed.length > 0 && failed.every((f) => isSlackUserLookupFailure(f.error));

  if (failed.length > 0) {
    if (failedLookupOnly) {
      // 設定問題，不是譯者操作失敗；案件「承接／無法承接」已寫入
      const emails = failed.map((f) => f.email).join("、");
      toast({
        title: anyOk ? "部分派案端無法在 Slack 收到通知" : "無法以 Slack 通知派案端",
        description: anyOk
          ? `以下信箱在 Slack 工作區找不到對應成員：${emails}。其餘收件人已收到。請 PM／執行長使用與 Slack 相同的 email，或由管理員將成員加入工作區。`
          : `以下信箱在 Slack 工作區找不到對應成員：${emails}。請 PM／執行長使用與 Slack 相同的 email，或由管理員將成員加入工作區。您在案件上的操作已記錄。`,
      });
      if (!anyOk) return;
    } else {
      toast({
        title: anyOk ? "Slack 通知部分失敗" : "Slack 通知未送出",
        description: failed.map((f) => `${f.email}(${f.error ?? "?"})`).join("；"),
        variant: "destructive",
      });
      if (!anyOk) return;
    }
  }

  if (anyOk) {
    toast({ title: "已透過 Slack 通知派案端" });
  }
}
