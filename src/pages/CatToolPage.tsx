import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";

/**
 * Embeds the vanilla CAT app from /cat/index.html (see cat-tool/ → public/cat via npm run sync:cat).
 *
 * Identity bridge: when the iframe loads (or when auth state changes while it is mounted),
 * a TMS_IDENTITY postMessage is sent to the iframe so the CAT tool can display the correct
 * user name, avatar, and role without needing its own login.
 *
 * The CAT tool verifies event.origin and event.source before accepting the message, so
 * this is safe even if the two apps are later deployed cross-origin.
 */
export default function CatToolPage() {
  const src = `${import.meta.env.BASE_URL}cat/index.html`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { user, profile, primaryRole } = useAuth();

  /** Build and send the identity payload to the CAT iframe. */
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
      // Same-origin: use exact origin so it still works if deployed cross-origin later.
      window.location.origin
    );
  }, [user, profile, primaryRole]);

  // Re-send whenever auth state (user / profile / role) changes while the page is mounted.
  useEffect(() => {
    sendIdentity();
  }, [sendIdentity]);

  return (
    <div className="-m-6 flex min-h-0 flex-1 flex-col" style={{ minHeight: "calc(100vh - 3rem)" }}>
      <iframe
        ref={iframeRef}
        title="CAT（建構中）"
        src={src}
        className="min-h-0 w-full flex-1 border-0 bg-background"
        onLoad={sendIdentity}
      />
    </div>
  );
}
