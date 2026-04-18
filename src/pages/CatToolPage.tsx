import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { handleCatCloudRpc } from "@/lib/cat-cloud-rpc";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
  const isPmOrAbove = primaryRole === "pm" || primaryRole === "executive";
  const isTranslatorOnly = primaryRole === "member";
  const collabChannelRef = useRef<RealtimeChannel | null>(null);
  const collabFileIdRef = useRef<string | null>(null);
  const collabSessionIdRef = useRef<string | null>(null);
  const collabFocusRef = useRef<Record<string, any>>({});
  const collabEditRef = useRef<Record<string, any>>({});

  const postCollabState = useCallback((members: any[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "TMS_COLLAB_STATE",
        payload: {
          fileId: collabFileIdRef.current,
          sessionId: collabSessionIdRef.current,
          members,
          focusBySession: collabFocusRef.current,
          editBySession: collabEditRef.current,
        },
      },
      window.location.origin
    );
  }, []);

  const extractMembersFromPresence = useCallback(() => {
    const channel = collabChannelRef.current;
    if (!channel) return [];
    const state = channel.presenceState() as Record<string, any[]>;
    const members: any[] = [];
    Object.entries(state).forEach(([sessionId, entries]) => {
      const latest = entries?.[entries.length - 1];
      if (!latest) return;
      members.push({
        sessionId,
        userId: latest.userId ?? null,
        displayName: latest.displayName ?? "Unknown User",
        avatarUrl: latest.avatarUrl ?? null,
        role: latest.role ?? null,
        joinedAt: latest.joinedAt ?? null,
      });
    });
    return members;
  }, []);

  const stopCollabChannel = useCallback(async () => {
    const channel = collabChannelRef.current;
    collabChannelRef.current = null;
    collabFileIdRef.current = null;
    collabSessionIdRef.current = null;
    collabFocusRef.current = {};
    collabEditRef.current = {};
    postCollabState([]);
    if (channel) {
      try {
        await supabase.removeChannel(channel);
      } catch (_) {
        // no-op
      }
    }
  }, [postCollabState]);

  const startCollabChannel = useCallback(async (payload: any) => {
    const fileId = String(payload?.fileId || "");
    const sessionId = String(payload?.sessionId || "");
    if (!fileId || !sessionId || !user?.id) return;

    if (collabFileIdRef.current === fileId && collabSessionIdRef.current === sessionId && collabChannelRef.current) {
      return;
    }
    await stopCollabChannel();
    collabFileIdRef.current = fileId;
    collabSessionIdRef.current = sessionId;

    const channel = supabase.channel(`cat-collab:${fileId}`, {
      config: { presence: { key: sessionId } },
    });
    collabChannelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        postCollabState(extractMembersFromPresence());
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        const leftKeys = ((leftPresences as any[]) || []).map((p: any) =>
          String(p?.key ?? "")
        );
        if (!leftKeys.length) return;
        let changed = false;
        const nextEdit = { ...collabEditRef.current };
        const nextFocus = { ...collabFocusRef.current };
        leftKeys.forEach((sid) => {
          if (sid && nextEdit[sid]) { delete nextEdit[sid]; changed = true; }
          if (sid && nextFocus[sid]) { delete nextFocus[sid]; changed = true; }
        });
        if (changed) {
          collabEditRef.current = nextEdit;
          collabFocusRef.current = nextFocus;
          postCollabState(extractMembersFromPresence());
        }
      })
      .on("broadcast", { event: "focus" }, ({ payload: focusPayload }) => {
        const senderSessionId = String(focusPayload?.sessionId || "");
        if (!senderSessionId) return;
        collabFocusRef.current = {
          ...collabFocusRef.current,
          [senderSessionId]: {
            sessionId: senderSessionId,
            fileId: String(focusPayload?.fileId || fileId),
            targetType: focusPayload?.targetType ?? null,
            targetId: focusPayload?.targetId ?? null,
            at: focusPayload?.at ?? new Date().toISOString(),
          },
        };
        postCollabState(extractMembersFromPresence());
      })
      .on("broadcast", { event: "edit" }, ({ payload: editPayload }) => {
        const senderSessionId = String(editPayload?.sessionId || "");
        if (!senderSessionId) return;
        const state = String(editPayload?.state || "");
        if (state === "end") {
          const next = { ...collabEditRef.current };
          delete next[senderSessionId];
          collabEditRef.current = next;
          postCollabState(extractMembersFromPresence());
          return;
        }
        collabEditRef.current = {
          ...collabEditRef.current,
          [senderSessionId]: {
            sessionId: senderSessionId,
            fileId: String(editPayload?.fileId || fileId),
            segmentId: editPayload?.segmentId ?? null,
            state: state || "start",
            text: editPayload?.text ?? null,
            at: editPayload?.at ?? new Date().toISOString(),
          },
        };
        postCollabState(extractMembersFromPresence());
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({
          userId: user.id,
          displayName: payload?.displayName ?? profile?.display_name ?? user.email ?? "Unknown User",
          avatarUrl: payload?.avatarUrl ?? profile?.avatar_url ?? null,
          role: payload?.role ?? primaryRole ?? null,
          joinedAt: new Date().toISOString(),
        });
      });
  }, [extractMembersFromPresence, postCollabState, primaryRole, profile?.avatar_url, profile?.display_name, stopCollabChannel, user?.email, user?.id]);

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
      .from("cat_file_assignments")
      .select(`
        id,
        file_id,
        status,
        assigned_at,
        updated_at,
        file:cat_files (
          id,
          project_id,
          name,
          source_lang,
          target_lang,
          last_modified
        )
      `)
      .eq("assignee_user_id", user.id)
      .neq("status", "cancelled")
      .order("assigned_at", { ascending: false });

    iframe.contentWindow.postMessage(
      {
        type: "TMS_ASSIGNMENTS",
        payload: {
          assignments: data ?? [],
          translatorOnly: isTranslatorOnly,
        },
      },
      window.location.origin
    );
  }, [isTranslatorOnly, user]);

  const sendAssignableUsers = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !user) return;

    const [{ data: profiles }, { data: roles }, { data: translatorSettings }] = await Promise.all([
      supabase.from("profiles").select("id, email, display_name, avatar_url"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("member_translator_settings").select("email, frozen"),
    ]);

    const frozenByEmail = new Map<string, boolean>();
    (translatorSettings ?? []).forEach((r: any) => {
      frozenByEmail.set(String(r.email).toLowerCase(), !!r.frozen);
    });

    const rolesByUserId = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const k = String(r.user_id);
      const arr = rolesByUserId.get(k) ?? [];
      arr.push(String(r.role));
      rolesByUserId.set(k, arr);
    });

    const members = (profiles ?? [])
      .filter((p: any) => !frozenByEmail.get(String(p.email || "").toLowerCase()))
      .map((p: any) => ({
        id: p.id,
        email: p.email,
        displayName: p.display_name || p.email,
        avatarUrl: p.avatar_url ?? null,
        roles: rolesByUserId.get(p.id) ?? [],
      }));

    iframe.contentWindow.postMessage(
      {
        type: "TMS_ASSIGNABLE_USERS",
        payload: {
          members,
          canAssign: isPmOrAbove,
          translatorOnly: isTranslatorOnly,
        },
      },
      window.location.origin
    );
  }, [isPmOrAbove, isTranslatorOnly, user]);

  // Re-send when meaningful auth fields change — omit sendIdentity/sendAssignments deps so
  // token refresh / object reference churn does not spam the iframe postMessage.
  useEffect(() => {
    sendIdentity();
    if (mode === "team") {
      void sendAssignments();
      void sendAssignableUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primitives above drive when to resync iframe
  }, [
    mode,
    user?.id,
    user?.email,
    primaryRole,
    isTranslatorOnly,
    isPmOrAbove,
    profile?.display_name,
    profile?.avatar_url,
  ]);

  // ── Listen for messages from the CAT iframe (team mode only) ─────────────────

  useEffect(() => {
    if (mode !== "team") return;

    const handler = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === "CAT_ASSIGNMENT_STATUS") {
        const { assignmentId, status } = event.data.payload ?? {};
        if (!assignmentId || !status) return;

        await supabase
          .from("cat_file_assignments")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", assignmentId);
      } else if (event.data?.type === "CAT_ASSIGN_FILE") {
        if (!isPmOrAbove) return;
        const { fileId, assigneeUserIds } = event.data.payload ?? {};
        if (!fileId || !Array.isArray(assigneeUserIds)) return;
        const uniqueUserIds = [...new Set(assigneeUserIds.map((x: string) => String(x)).filter(Boolean))];
        if (uniqueUserIds.length === 0) return;
        const rows = uniqueUserIds.map((uid) => ({
          file_id: fileId,
          assignee_user_id: uid,
          assigned_by: user?.id ?? null,
          status: "assigned",
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from("cat_file_assignments").upsert(rows, { onConflict: "file_id,assignee_user_id" });
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "TMS_ASSIGN_FILE_RESULT",
            payload: { ok: !error, fileId, error: error?.message ?? null },
          },
          window.location.origin
        );
      } else if (event.data?.type === "CAT_UNASSIGN_FILE") {
        if (!isPmOrAbove) return;
        const { fileId, assigneeUserId } = event.data.payload ?? {};
        if (!fileId || !assigneeUserId) return;
        const { error } = await supabase
          .from("cat_file_assignments")
          .delete()
          .eq("file_id", fileId)
          .eq("assignee_user_id", assigneeUserId);
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "TMS_UNASSIGN_FILE_RESULT",
            payload: { ok: !error, fileId, assigneeUserId, error: error?.message ?? null },
          },
          window.location.origin
        );
      } else if (event.data?.type === "CAT_REQUEST_FILE_ASSIGNMENTS") {
        const { fileId } = event.data.payload ?? {};
        if (!fileId) return;
        const { data } = await supabase
          .from("cat_file_assignments")
          .select("id,file_id,assignee_user_id,status,assigned_at,updated_at")
          .eq("file_id", fileId)
          .neq("status", "cancelled");
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: "TMS_FILE_ASSIGNMENTS",
            payload: { fileId, assignments: data ?? [] },
          },
          window.location.origin
        );
      } else if (event.data?.type === "CAT_REQUEST_PROJECT_ASSIGNMENTS") {
        const { projectId } = event.data.payload ?? {};
        if (!projectId) return;
        const { data: files } = await supabase.from("cat_files").select("id").eq("project_id", projectId);
        const fileIds = (files ?? []).map((f: { id: string }) => f.id);
        if (fileIds.length === 0) {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "TMS_PROJECT_ASSIGNMENTS", payload: { projectId, byFile: {} } },
            window.location.origin
          );
          return;
        }
        const { data: asg } = await supabase
          .from("cat_file_assignments")
          .select("file_id, assignee_user_id, status")
          .in("file_id", fileIds)
          .neq("status", "cancelled");
        const uids = [...new Set((asg ?? []).map((a: { assignee_user_id: string }) => a.assignee_user_id))];
        const { data: profs } = await supabase.from("profiles").select("id, display_name, email").in("id", uids);
        const nameById = new Map((profs ?? []).map((p: { id: string; display_name: string | null; email: string | null }) => [p.id, (p.display_name || p.email || "").trim() || p.id]));
        const byFile: Record<string, string[]> = {};
        for (const a of asg ?? []) {
          const row = a as { file_id: string; assignee_user_id: string };
          const n = nameById.get(row.assignee_user_id) || row.assignee_user_id;
          if (!byFile[row.file_id]) byFile[row.file_id] = [];
          if (!byFile[row.file_id].includes(n)) byFile[row.file_id].push(n);
        }
        iframeRef.current?.contentWindow?.postMessage(
          { type: "TMS_PROJECT_ASSIGNMENTS", payload: { projectId, byFile } },
          window.location.origin
        );
      } else if (event.data?.type === "CAT_COLLAB_JOIN") {
        await startCollabChannel(event.data.payload ?? {});
      } else if (event.data?.type === "CAT_COLLAB_LEAVE") {
        const { fileId, sessionId } = event.data.payload ?? {};
        const sameFile = fileId && collabFileIdRef.current === String(fileId);
        const sameSession = sessionId && collabSessionIdRef.current === String(sessionId);
        if (sameFile || sameSession) await stopCollabChannel();
      } else if (event.data?.type === "CAT_COLLAB_FOCUS") {
        const channel = collabChannelRef.current;
        if (!channel) return;
        const { fileId, sessionId, targetType, targetId } = event.data.payload ?? {};
        if (!fileId || !sessionId || collabFileIdRef.current !== String(fileId)) return;
        await channel.send({
          type: "broadcast",
          event: "focus",
          payload: {
            fileId: String(fileId),
            sessionId: String(sessionId),
            targetType: targetType ?? null,
            targetId: targetId ?? null,
            at: new Date().toISOString(),
          },
        });
      } else if (event.data?.type === "CAT_COLLAB_EDIT") {
        const channel = collabChannelRef.current;
        if (!channel) return;
        const { fileId, sessionId, segmentId, state, text } = event.data.payload ?? {};
        if (!fileId || !sessionId || !state || collabFileIdRef.current !== String(fileId)) return;
        await channel.send({
          type: "broadcast",
          event: "edit",
          payload: {
            fileId: String(fileId),
            sessionId: String(sessionId),
            segmentId: segmentId ?? null,
            state: String(state),
            text: typeof text === "string" ? text : null,
            at: new Date().toISOString(),
          },
        });
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
  }, [isPmOrAbove, mode, user]);

  useEffect(() => {
    return () => {
      stopCollabChannel();
    };
  }, [stopCollabChannel]);

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
          if (mode === "team") sendAssignableUsers();
        }}
      />
    </div>
  );
}
