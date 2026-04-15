import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { handleCatCloudRpc } from "@/lib/cat-cloud-rpc";

/**
 * Embeds the vanilla CAT app from /cat/index.html (see cat-tool/ → public/cat via npm run sync:cat).
 *
 * mode="offline"  (個人離線版) — only sends TMS_IDENTITY; assignment panel stays hidden.
 * mode="team"     (團隊線上版) — additionally sends TMS_ASSIGNMENTS and handles the
 *                 CAT_REQUEST_FILE_URL / CAT_ASSIGNMENT_STATUS message bridge.
 *
 * Both modes load the same iframe; the difference is purely which postMessages are sent.
 * All editor logic lives in cat-tool/ (one codebase); only this thin React wrapper differs.
 */
export default function CatToolPage({ mode = "offline" }: { mode?: "offline" | "team" }) {
  const catStorage = mode === "team" ? "team" : "offline";
  const src = `${import.meta.env.BASE_URL}cat/index.html?catStorage=${encodeURIComponent(catStorage)}`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { user, profile, primaryRole } = useAuth();

  // ── Identity bridge ───────────────────────────────────────────────────────────

  const sendIdentity = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !user) return;

    const displayName =
      profile?.display_name?.trim() ||
      user.email?.split("@")[0] ||
      "Unknown User";

    iframe.contentWindow.postMessage(
      {
        type: "TMS_IDENTITY",
        payload: {
          displayName,
          email: user.email ?? "",
          avatarUrl: profile?.avatar_url ?? null,
          role: primaryRole,
          userId: user.id,
        },
      },
      window.location.origin
    );
  }, [user, profile, primaryRole]);

  // ── Assignment bridge ─────────────────────────────────────────────────────────

  const sendAssignments = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !user) return;

    const { data } = await supabase
      .from("cat_assignments")
      .select("*")
      .eq("translator_user_id", user.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });

    iframe.contentWindow.postMessage(
      {
        type: "TMS_ASSIGNMENTS",
        payload: { assignments: data ?? [] },
      },
      window.location.origin
    );
  }, [user]);

  // Re-send whenever auth state changes while the page is mounted.
  useEffect(() => {
    sendIdentity();
    if (mode === "team") sendAssignments();
  }, [sendIdentity, sendAssignments, mode]);

  // ── Listen for messages from the CAT iframe (team mode only) ─────────────────

  useEffect(() => {
    if (mode !== "team") return;

    const handler = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === "CAT_REQUEST_FILE_URL") {
        const { assignmentId } = event.data.payload ?? {};
        if (!assignmentId) return;

        const { data: a } = await supabase
          .from("cat_assignments")
          .select("source_file_storage_path, source_file_name")
          .eq("id", assignmentId)
          .single();

        if (!a) return;

        const { data: signed } = await supabase.storage
          .from("case-files")
          .createSignedUrl(a.source_file_storage_path, 3600);

        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "TMS_FILE_URL",
            payload: {
              assignmentId,
              signedUrl: signed?.signedUrl ?? null,
              fileName: a.source_file_name,
            },
          },
          window.location.origin
        );
      } else if (event.data?.type === "CAT_ASSIGNMENT_STATUS") {
        const { assignmentId, status } = event.data.payload ?? {};
        if (!assignmentId || !status) return;

        await supabase
          .from("cat_assignments")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", assignmentId);
      } else if (event.data?.type === "CAT_CLOUD_RPC") {
        const { requestId, action, payload } = event.data.payload ?? {};
        if (!requestId || !action || !user?.id) return;
        try {
          const data = await handleCatCloudRpc(action, payload ?? {}, user.id);
          iframeRef.current?.contentWindow?.postMessage(
            { type: "CAT_CLOUD_RPC_RESULT", payload: { requestId, ok: true, data } },
            window.location.origin
          );
        } catch (error: any) {
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: "CAT_CLOUD_RPC_RESULT",
              payload: { requestId, ok: false, error: error?.message || String(error) },
            },
            window.location.origin
          );
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [user, mode]);

  return (
    <div className="-m-6 flex min-h-0 flex-1 flex-col" style={{ minHeight: "calc(100vh - 3rem)" }}>
      <iframe
        ref={iframeRef}
        title={mode === "team" ? "CAT 團隊線上版" : "CAT 個人離線版"}
        src={src}
        className="min-h-0 w-full flex-1 border-0 bg-background"
        onLoad={() => {
          sendIdentity();
          if (mode === "team") sendAssignments();
        }}
      />
    </div>
  );
}
