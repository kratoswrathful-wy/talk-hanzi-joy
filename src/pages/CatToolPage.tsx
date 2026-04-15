import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Embeds the vanilla CAT app from /cat/index.html (see cat-tool/ → public/cat via npm run sync:cat).
 *
 * Identity bridge: when the iframe loads (or when auth state changes while it is mounted),
 * a TMS_IDENTITY postMessage is sent to the iframe so the CAT tool can display the correct
 * user name, avatar, and role without needing its own login.
 *
 * Assignment bridge: sendAssignments queries cat_assignments for the current user and
 * delivers them as TMS_ASSIGNMENTS. The CAT iframe can request signed download URLs via
 * CAT_REQUEST_FILE_URL, and report status changes via CAT_ASSIGNMENT_STATUS.
 */
export default function CatToolPage() {
  const src = `${import.meta.env.BASE_URL}cat/index.html`;
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
    sendAssignments();
  }, [sendIdentity, sendAssignments]);

  // ── Listen for messages from the CAT iframe ───────────────────────────────────

  useEffect(() => {
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
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [user]);

  return (
    <div className="-m-6 flex min-h-0 flex-1 flex-col" style={{ minHeight: "calc(100vh - 3rem)" }}>
      <iframe
        ref={iframeRef}
        title="CAT（建構中）"
        src={src}
        className="min-h-0 w-full flex-1 border-0 bg-background"
        onLoad={() => {
          sendIdentity();
          sendAssignments();
        }}
      />
    </div>
  );
}
