export const TEST_MODE_RETURN_TOKEN_KEY = "tms_test_mode_return_token";
export const TEST_MODE_RETURN_EMAIL_KEY = "tms_test_mode_return_email";

interface ReturnTicketStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface VerifyTokenResult {
  email: string | null;
  error: string | null;
}

interface RestoreReturnSessionOptions {
  storage: ReturnTicketStorage;
  verifyToken: (token: string) => Promise<VerifyTokenResult>;
  signOut: () => Promise<unknown>;
}

export type RestoreReturnSessionResult =
  | { status: "restored"; email: string }
  | {
      status: "signed-out";
      reason: "missing-ticket" | "verification-failed" | "identity-mismatch";
      message: string | null;
    };

export function clearTestModeReturnTicket(storage: ReturnTicketStorage): void {
  storage.removeItem(TEST_MODE_RETURN_TOKEN_KEY);
  storage.removeItem(TEST_MODE_RETURN_EMAIL_KEY);
}

export function replaceTestModeReturnTicket(
  storage: ReturnTicketStorage,
  ticket: { token: string; email: string } | null,
): void {
  clearTestModeReturnTicket(storage);
  if (!ticket?.token || !ticket.email) return;
  storage.setItem(TEST_MODE_RETURN_TOKEN_KEY, ticket.token);
  storage.setItem(TEST_MODE_RETURN_EMAIL_KEY, ticket.email);
}

function readTestModeReturnTicket(
  storage: ReturnTicketStorage,
): { token: string; email: string } | null {
  const token = storage.getItem(TEST_MODE_RETURN_TOKEN_KEY);
  const email = storage.getItem(TEST_MODE_RETURN_EMAIL_KEY);
  return token && email ? { token, email } : null;
}

/**
 * 消費返回票並確認實際切回的人就是票面本人。
 *
 * 返回票在驗證完成前保留，避免暫時性錯誤讓同分頁失去復原能力；
 * 票失效或切回錯誤身分時，清掉票並登出，禁止停留在不確定的 session。
 */
export async function restoreTestModeReturnSession({
  storage,
  verifyToken,
  signOut,
}: RestoreReturnSessionOptions): Promise<RestoreReturnSessionResult> {
  const ticket = readTestModeReturnTicket(storage);
  if (!ticket) {
    clearTestModeReturnTicket(storage);
    await signOut();
    return { status: "signed-out", reason: "missing-ticket", message: null };
  }

  let verification: VerifyTokenResult;
  try {
    verification = await verifyToken(ticket.token);
  } catch (error) {
    verification = {
      email: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (
    !verification.error
    && verification.email
    && verification.email.toLowerCase() === ticket.email.toLowerCase()
  ) {
    clearTestModeReturnTicket(storage);
    return { status: "restored", email: verification.email };
  }

  clearTestModeReturnTicket(storage);
  await signOut();

  if (verification.error) {
    return {
      status: "signed-out",
      reason: "verification-failed",
      message: verification.error,
    };
  }

  return {
    status: "signed-out",
    reason: "identity-mismatch",
    message: verification.email,
  };
}
