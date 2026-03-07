/**
 * Environment detection utility.
 * Separates test (Lovable preview) from production data.
 *
 * Test environments:
 *   - *.lovableproject.com
 *   - *-preview--*.lovable.app
 *   - localhost / 127.0.0.1
 *
 * Everything else is considered production.
 */

let _env: "test" | "production" | null = null;

export function getEnvironment(): "test" | "production" {
  if (_env) return _env;

  const host = window.location.hostname;

  const isTest =
    host.includes("lovableproject.com") ||
    host.includes("-preview--") ||
    host === "localhost" ||
    host === "127.0.0.1";

  _env = isTest ? "test" : "production";
  return _env;
}

/** Prefix a settings key with the current environment */
export function envKey(key: string): string {
  return `${getEnvironment()}:${key}`;
}
