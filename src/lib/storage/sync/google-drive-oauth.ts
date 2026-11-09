/**
 * Google Drive OAuth 2.0 authentication handler.
 *
 * Uses the authorization code flow with PKCE. This works for both the Tauri
 * desktop app and a normal browser.
 *
 * Required setup:
 * 1. Create a Google Cloud project.
 * 2. Enable the Drive API.
 * 3. Configure the OAuth consent screen with these scopes:
 *    - https://www.googleapis.com/auth/drive.appdata
 *    - openid
 *    - email
 * 4. Create an OAuth 2.0 Client ID for a desktop application.
 * 5. Copy the client secret into `VITE_GOOGLE_CLIENT_SECRET` in a local
 *    `.env.local` file (see `.env.example`). Google requires the secret even
 *    though desktop clients cannot keep it confidential.
 * 6. Replace GOOGLE_CLIENT_ID below with your actual Client ID.
 * 7. Add `http://127.0.0.1` as an authorized redirect URI for the fallback.
 *
 * Desktop apps cannot receive a normal HTTPS redirect. In the Tauri app the
 * browser is sent to a temporary `http://127.0.0.1:{port}` listener, which
 * completes the flow automatically. Browsers (desktop and mobile, including
 * the installed PWA) redirect back to the app's own HTTPS URL instead, which
 * the app completes automatically on return. Only an older desktop build
 * without the listener still needs the user to copy the `code` parameter
 * from the browser address bar back into the app.
 */

export const GOOGLE_CLIENT_ID = "716095902309-r0r2jr5st4adjup28a2278jmslpiteug.apps.googleusercontent.com";
export const GOOGLE_REDIRECT_URI = "http://127.0.0.1";

/**
 * OAuth client of type "Web application" used by the PWA. Unlike the desktop
 * client above, Google allows it to redirect back to the app's own HTTPS URL
 * so authorization completes without copy/paste. Falls back to the desktop
 * client until the web client is configured (see `.env.example`).
 */
export function getGoogleWebClientId(): string {
  const configured = (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined) || "";
  return configured || GOOGLE_CLIENT_ID;
}

/**
 * The redirect URI for browser/PWA authorization: the app's own URL. It must
 * be registered exactly (including the trailing slash) under Authorized
 * redirect URIs in the Google Cloud console.
 */
export function getWebRedirectUri(): string {
  if (typeof window === "undefined") return GOOGLE_REDIRECT_URI;
  try {
    const url = new URL(window.location.href);
    let path = url.pathname.replace(/index\.html$/, "");
    if (!path.endsWith("/")) path += "/";
    url.pathname = path;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return GOOGLE_REDIRECT_URI;
  }
}

/**
 * Google requires a client secret for desktop app clients even when PKCE is
 * used. The value comes from a local, gitignored `.env` file so it is not
 * committed. Desktop client secrets are not truly confidential: anyone with
 * the built app can extract them.
 */
export function getGoogleClientSecret(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? "";
}

function missingClientSecret(): AuthResult | null {
  if (getGoogleClientSecret()) return null;
  return {
    success: false,
    error:
      "Google Drive sync is not configured. Set VITE_GOOGLE_CLIENT_SECRET in .env.local (see .env.example)."
  };
}

const DRIVE_SCOPE = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.appdata"
].join(" ");

const STATE_KEY = "prosecraft-oauth-state";
const VERIFIER_KEY = "prosecraft-oauth-code-verifier";
const REDIRECT_KEY = "prosecraft-oauth-redirect-uri";

export type GoogleDriveTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiry: number; // Unix timestamp in milliseconds
  email: string | null;
};

export type AuthResult = {
  success: boolean;
  tokens?: GoogleDriveTokens;
  error?: string;
  /** True when the browser was opened and the app is waiting for a code. */
  pending?: boolean;
  /** True when the user stopped an in-progress loopback authorization. */
  cancelled?: boolean;
  /** Authorization URL to open manually when a popup was blocked. */
  authorizationUrl?: string;
};

/** Receives progress messages while the browser authorization is running. */
export type GoogleDriveAuthProgress = (message: string) => void;

type LoopbackCallback = {
  code?: string | null;
  state?: string | null;
  error?: string | null;
  cancelled?: boolean;
};

/** Fallbacks for environments without sessionStorage (tests and SSR). */
let pendingVerifier = "";
let pendingState = "";
let pendingRedirectUri = "";
/** The popup opened during the user gesture, if the browser allowed one. */
let pendingAuthWindow: Window | null = null;

function readSession(key: string): string {
  try {
    return typeof sessionStorage === "undefined" ? "" : (sessionStorage.getItem(key) ?? "");
  } catch {
    return "";
  }
}

function writeSession(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private browsing; the module fallback is
    // still enough for the current authorization attempt.
  }
}

function removeSession(key: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

function readLocal(key: string): string {
  try {
    return typeof localStorage === "undefined" ? "" : (localStorage.getItem(key) ?? "");
  } catch {
    return "";
  }
}

function writeLocal(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private browsing; the session copy or the
    // module fallback is still enough for the current authorization attempt.
  }
}

function removeLocal(key: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

function readFirst(key: string, memory: string): string {
  return readSession(key) || readLocal(key) || memory;
}

function rememberPendingFlow(verifier: string, state: string, redirectUri?: string): void {
  pendingVerifier = verifier;
  pendingState = state;
  writeSession(VERIFIER_KEY, verifier);
  writeSession(STATE_KEY, state);
  // Mirror to localStorage: on mobile the Google page opens in a different
  // tab with its own sessionStorage, so the tab that completes the redirect
  // would otherwise lose the verifier.
  writeLocal(VERIFIER_KEY, verifier);
  writeLocal(STATE_KEY, state);
  if (redirectUri !== undefined) {
    pendingRedirectUri = redirectUri;
    writeSession(REDIRECT_KEY, redirectUri);
    writeLocal(REDIRECT_KEY, redirectUri);
  }
}

function readPendingFlow(): { verifier: string; state: string; redirectUri: string } {
  return {
    verifier: readFirst(VERIFIER_KEY, pendingVerifier),
    state: readFirst(STATE_KEY, pendingState),
    redirectUri: readFirst(REDIRECT_KEY, pendingRedirectUri)
  };
}

function clearPendingFlow(): void {
  pendingVerifier = "";
  pendingState = "";
  pendingRedirectUri = "";
  removeSession(VERIFIER_KEY);
  removeSession(STATE_KEY);
  removeSession(REDIRECT_KEY);
  removeLocal(VERIFIER_KEY);
  removeLocal(STATE_KEY);
  removeLocal(REDIRECT_KEY);
}

/** Generate a random PKCE code verifier. */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Generate the PKCE code challenge from a verifier. */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Generate a random state parameter for CSRF protection. */
function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isTauriRuntime(): Promise<boolean> {
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    return isTauri();
  } catch {
    return false;
  }
}

function isTauriRuntimeSync(): boolean {
  return typeof globalThis !== "undefined"
    && Boolean((globalThis as { isTauri?: boolean }).isTauri);
}

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Open the OAuth authorization URL in the system browser (Tauri without a
 * loopback listener). Browsers always use the same-tab redirect instead.
 */
async function openAuthUrl(url: string, popup: Window | null): Promise<boolean> {
  if (await isTauriRuntime()) {
    try {
      popup?.close();
    } catch {
      // No popup was opened, or the webview already closed it.
    }
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return true;
  }
  if (popup && !popup.closed) {
    try {
      popup.location.replace(url);
      return true;
    } catch {
      try {
        popup.location.href = url;
        return true;
      } catch {
        popup.close();
      }
    }
  }
  const opened = window.open(url, "_blank");
  if (!opened) return false;
  pendingAuthWindow = opened;
  try {
    opened.opener = null;
  } catch {
    // Ignore; the window still works for authorization.
  }
  return true;
}

/** Ask the Tauri backend for a temporary loopback port. */
async function startLoopback(): Promise<{ port: number } | null> {
  if (!(await isTauriRuntime())) return null;
  // A mobile browser cannot reach a listener inside the app, so those builds
  // keep using the web redirect flow.
  if (isMobileBrowser()) {
    return null;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const port = await invoke<number>("oauth_start_loopback");
    return typeof port === "number" && port > 0 ? { port } : null;
  } catch {
    // Older desktop builds do not have the listener; fall back to copy/paste.
    return null;
  }
}

/** Wait for the loopback server to receive Google's redirect. */
async function waitForLoopback(): Promise<LoopbackCallback> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<LoopbackCallback>("oauth_wait_for_callback");
}

/** Stop a loopback listener that is still waiting for a redirect. */
async function cancelLoopback(): Promise<void> {
  if (!(await isTauriRuntime())) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("oauth_cancel_loopback");
  } catch {
    // There was no listener to cancel.
  }
}

function buildAuthUrl(
  codeChallenge: string,
  state: string,
  redirectUri: string,
  clientId: string = GOOGLE_CLIENT_ID
): URL {
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", DRIVE_SCOPE);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);
  // offline + consent makes Google return a refresh token, which lets sync
  // keep working after the short-lived access token expires.
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  return authUrl;
}

/**
 * Start the OAuth flow. On desktop Tauri the browser is sent to a temporary
 * loopback listener and the tokens come back automatically. Everywhere else
 * the app navigates the current tab to Google and the app boots again on
 * return, where completeWebRedirectIfPresent() finishes the exchange — no
 * copy/paste needed.
 */
export async function authenticateGoogleDrive(
  onProgress?: GoogleDriveAuthProgress
): Promise<AuthResult> {
  const configurationError = missingClientSecret();
  if (configurationError) return configurationError;

  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    const loopback = await startLoopback();
    // loopback is only ever non-null on desktop Tauri builds. Tauri without
    // a loopback listener keeps the old system-browser + copy/paste path,
    // because navigating the app webview itself to Google would strand it.
    // Everywhere else (desktop and mobile browsers, installed PWA) the
    // same-tab redirect below returns to the app automatically.
    const useWebRedirect = !loopback && !isTauriRuntimeSync();
    const redirectUri = loopback
      ? `http://127.0.0.1:${loopback.port}`
      : useWebRedirect
        ? getWebRedirectUri()
        : GOOGLE_REDIRECT_URI;
    const clientId = useWebRedirect ? getGoogleWebClientId() : GOOGLE_CLIENT_ID;
    rememberPendingFlow(codeVerifier, state, redirectUri);
    const authUrl = buildAuthUrl(codeChallenge, state, redirectUri, clientId);

    if (useWebRedirect) {
      try {
        window.location.href = authUrl.toString();
      } catch {
        // Non-browser environment; the pending result below still lets
        // callers drive the flow manually.
      }
      return {
        success: false,
        pending: true,
        authorizationUrl: authUrl.toString(),
        error: "Opening Google authorization…"
      };
    }

    const opened = await openAuthUrl(authUrl.toString(), null);
    if (!opened) {
      pendingAuthWindow = null;
    }

    if (!loopback) {
      return {
        success: false,
        pending: true,
        authorizationUrl: authUrl.toString(),
        error: opened
          ? "Authorization page opened. After approving access, copy the `code` parameter from the browser address bar and paste it below."
          : "Your browser blocked the authorization window. Open the Google authorization page below, approve access, then paste the code."
      };
    }

    onProgress?.("Waiting for you to approve access in your browser…");
    const callback = await waitForLoopback();

    if (callback.cancelled) {
      clearPendingFlow();
      return { success: false, cancelled: true };
    }
    if (callback.error) {
      clearPendingFlow();
      return {
        success: false,
        error: `Google Drive authorization failed: ${callback.error}`
      };
    }
    if (!callback.code) {
      clearPendingFlow();
      return { success: false, error: "Google did not return an authorization code." };
    }
    if (callback.state && callback.state !== state) {
      clearPendingFlow();
      return {
        success: false,
        error: "The authorization response did not match this request. Start the connection again."
      };
    }

    const result = await exchangeCodeForToken(callback.code, codeVerifier, redirectUri);
    if (result.success) pendingAuthWindow = null;
    return result;
  } catch (error) {
    clearPendingFlow();
    void cancelLoopback();
    try {
      pendingAuthWindow?.close();
    } catch {
      // The tab may already have been closed by the user.
    }
    pendingAuthWindow = null;
    return {
      success: false,
      error: error instanceof Error ? error.message : "Authentication failed."
    };
  }
}

/** Forget any in-progress authorization flow. */
export function cancelGoogleDriveAuthorization(): void {
  clearPendingFlow();
  void cancelLoopback();
  try {
    pendingAuthWindow?.close();
  } catch {
    // The tab may already have been closed by the user.
  }
  pendingAuthWindow = null;
}

function normalizeRedirectPath(path: string): string {
  return path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
}

/**
 * True when the stored redirect URI points at this page. Desktop flows store
 * a loopback address, so a stray `?code=` here never belongs to them.
 */
function redirectMatchesCurrentPage(redirectUri: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const expected = new URL(redirectUri);
    return expected.origin === window.location.origin
      && normalizeRedirectPath(expected.pathname) === normalizeRedirectPath(window.location.pathname);
  } catch {
    return false;
  }
}

/** Remove OAuth response parameters so a reload does not reprocess them. */
function stripOAuthParams(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("scope");
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url.toString());
  } catch {
    // Non-browser environment; nothing to clean up.
  }
}

/**
 * Complete a web authorization that redirected back to the app (PWA flow).
 * Returns null when the current URL carries no authorization response for a
 * flow this device started, so callers can safely run it on every startup.
 */
export async function completeWebRedirectIfPresent(): Promise<AuthResult | null> {
  if (typeof window === "undefined") return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return null;
  }
  if (params.get("error")) {
    const pending = readPendingFlow();
    if (!pending.verifier) return null;
    clearPendingFlow();
    stripOAuthParams();
    return {
      success: false,
      error: `Google Drive authorization failed: ${params.get("error") ?? "access denied"}`
    };
  }
  const code = params.get("code");
  if (!code) return null;
  const state = params.get("state");
  const pending = readPendingFlow();
  if (!pending.verifier) {
    stripOAuthParams();
    return null;
  }
  if (pending.redirectUri && !redirectMatchesCurrentPage(pending.redirectUri)) {
    // A different flow (e.g. the desktop copy/paste fallback) owns this code.
    return null;
  }
  if (state && pending.state && state !== pending.state) {
    clearPendingFlow();
    stripOAuthParams();
    return {
      success: false,
      error: "The authorization response did not match this request. Start the connection again."
    };
  }
  const result = await exchangeCodeForToken(code, pending.verifier, pending.redirectUri || getWebRedirectUri());
  if (result.success) stripOAuthParams();
  return result;
}

/**
 * Accepts either a bare authorization code or a full redirect URL and pulls out
 * the `code` (and `state`, when present).
 */
export function parseAuthorizationInput(input: string): { code: string; state?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { code: "" };

  if (trimmed.includes("code=")) {
    try {
      const url = trimmed.startsWith("http")
        ? new URL(trimmed)
        : new URL(`http://127.0.0.1/?${trimmed.replace(/^\?/, "")}`);
      return {
        code: url.searchParams.get("code") ?? "",
        state: url.searchParams.get("state") ?? undefined
      };
    } catch {
      // Fall through and treat the input as a bare code.
    }
  }

  return { code: trimmed };
}

/**
 * Exchange an authorization code for an access token and refresh token.
 * `codeVerifier` is optional because the verifier from `authenticateGoogleDrive`
 * is already kept in session storage. `redirectUri` must match the URI used to
 * start the flow; the loopback flow passes its ephemeral port here.
 */
export async function exchangeCodeForToken(
  input: string,
  codeVerifier?: string,
  redirectUri: string = GOOGLE_REDIRECT_URI
): Promise<AuthResult> {
  try {
    const configurationError = missingClientSecret();
    if (configurationError) return configurationError;

    const { code, state } = parseAuthorizationInput(input);
    if (!code) {
      return { success: false, error: "No authorization code was provided." };
    }

    const pending = readPendingFlow();
    const verifier = codeVerifier || pending.verifier;
    if (!verifier) {
      return {
        success: false,
        error: "The authorization request expired. Start the connection again."
      };
    }
    if (state && pending.state && state !== pending.state) {
      return {
        success: false,
        error: "The authorization response did not match this request. Start the connection again."
      };
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: getGoogleClientSecret(),
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    const tokens: GoogleDriveTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiry: Date.now() + (data.expires_in * 1000),
      email: null
    };

    try {
      tokens.email = await getGoogleDriveEmail(tokens.accessToken);
    } catch {
      // Email is only a label in the UI; authentication still succeeded.
    }

    clearPendingFlow();
    return { success: true, tokens };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to exchange code for token."
    };
  }
}

/** True when the access token is expired or will expire within the buffer. */
export function isTokenExpired(tokens: GoogleDriveTokens, bufferMs: number = 60_000): boolean {
  if (!tokens.expiry) return true;
  return Date.now() >= (tokens.expiry - bufferMs);
}

/** Refresh an access token using a stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<AuthResult> {
  try {
    const configurationError = missingClientSecret();
    if (configurationError) return configurationError;

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: getGoogleClientSecret(),
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      success: true,
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiry: Date.now() + (data.expires_in * 1000),
        email: null
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to refresh token."
    };
  }
}

/** Revoke an access token (or refresh token) at Google. */
export async function revokeGoogleDriveAccess(token: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`
    );
    return response.ok;
  } catch {
    return false;
  }
}

/** Read the signed-in account's email address, when the grant allows it. */
export async function getGoogleDriveEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (response.ok) {
      const data = await response.json();
      if (typeof data.email === "string" && data.email) return data.email;
    }
  } catch {
    // Fall through to the Drive endpoint for older grants.
  }

  try {
    const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.user?.emailAddress || null;
  } catch {
    return null;
  }
}
