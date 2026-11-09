import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateGoogleDrive,
  completeWebRedirectIfPresent,
  exchangeCodeForToken,
  getGoogleWebClientId,
  getWebRedirectUri,
  GOOGLE_CLIENT_ID,
  isTokenExpired,
  parseAuthorizationInput,
  refreshAccessToken
} from "./google-drive-oauth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  try {
    sessionStorage.clear();
  } catch {
    // Storage may be unavailable; nothing to clean.
  }
  try {
    localStorage.clear();
  } catch {
    // Storage may be unavailable; nothing to clean.
  }
  try {
    window.history.replaceState(null, "", window.location.pathname);
  } catch {
    // jsdom only; ignore.
  }
});

describe("Google Drive OAuth helpers", () => {
  it("accepts a bare authorization code", () => {
    expect(parseAuthorizationInput("  4/abc  ")).toEqual({ code: "4/abc" });
  });

  it("accepts the full redirect URL", () => {
    expect(parseAuthorizationInput("http://127.0.0.1/?code=4%2Fabc&state=xyz")).toEqual({
      code: "4/abc",
      state: "xyz"
    });
  });

  it("accepts a loopback redirect URL with an ephemeral port", () => {
    expect(parseAuthorizationInput("http://127.0.0.1:51234/?code=4%2Fabc&state=xyz")).toEqual({
      code: "4/abc",
      state: "xyz"
    });
  });

  it("accepts a query string without the host", () => {
    expect(parseAuthorizationInput("?code=4%2Fabc&state=xyz")).toEqual({
      code: "4/abc",
      state: "xyz"
    });
  });

  it("treats missing, expired, and nearly-expired tokens as expired", () => {
    expect(isTokenExpired({
      accessToken: "token",
      refreshToken: null,
      expiry: 0,
      email: null
    })).toBe(true);

    expect(isTokenExpired({
      accessToken: "token",
      refreshToken: null,
      expiry: Date.now() + 30_000,
      email: null
    })).toBe(true);

    expect(isTokenExpired({
      accessToken: "token",
      refreshToken: null,
      expiry: Date.now() + 120_000,
      email: null
    })).toBe(false);
  });
});

describe("Google Drive token requests", () => {
  it("sends the client secret when exchanging an authorization code", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_SECRET", "test-secret");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("", { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeCodeForToken(
      "code",
      "verifier",
      "http://127.0.0.1:51234"
    );

    expect(result.success).toBe(true);
    const tokenCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("oauth2.googleapis.com/token")
    );
    const body = tokenCall?.[1]?.body as URLSearchParams;
    expect(body.get("client_secret")).toBe("test-secret");
    expect(body.get("redirect_uri")).toBe("http://127.0.0.1:51234");
  });

  it("sends the client secret when refreshing a token", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_SECRET", "test-secret");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({
        access_token: "access",
        expires_in: 3600
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshAccessToken("refresh-token");

    expect(result.success).toBe(true);
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("client_secret")).toBe("test-secret");
    expect(body.get("refresh_token")).toBe("refresh-token");
  });

  it("reports a configuration error when the client secret is missing", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_SECRET", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeCodeForToken("code", "verifier");

    expect(result.success).toBe(false);
    expect(result.error).toContain("VITE_GOOGLE_CLIENT_SECRET");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("PWA web authorization flow", () => {
  it("falls back to the desktop client until a web client is configured", () => {
    vi.stubEnv("VITE_GOOGLE_WEB_CLIENT_ID", "");
    expect(getGoogleWebClientId()).toBe(GOOGLE_CLIENT_ID);
    vi.stubEnv("VITE_GOOGLE_WEB_CLIENT_ID", "web-client-id");
    expect(getGoogleWebClientId()).toBe("web-client-id");
  });

  it("derives the redirect URI from the app URL with a trailing slash", () => {
    expect(getWebRedirectUri()).toBe("http://localhost:3000/");
  });

  it("ignores startup URLs without an authorization response", async () => {
    const result = await completeWebRedirectIfPresent();
    expect(result).toBeNull();
  });

  it("ignores an authorization code with no matching pending flow", async () => {
    window.history.replaceState(null, "", "/?code=stray-code&state=stray-state");
    const result = await completeWebRedirectIfPresent();
    expect(result).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("redirects desktop browsers to the app URL too", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_SECRET", "test-secret");
    // Default jsdom user agent is a desktop browser: no popup is opened and
    // the flow returns pending with a same-tab redirect, just like mobile.
    const started = await authenticateGoogleDrive();
    expect(started.pending).toBe(true);
    expect(started.authorizationUrl).toContain(encodeURIComponent("http://localhost:3000/"));
  });

  it("completes a mobile redirect without copy/paste", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_SECRET", "test-secret");
    vi.stubGlobal("navigator", { userAgent: "iPhone" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response("", { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const started = await authenticateGoogleDrive();
    expect(started.pending).toBe(true);
    expect(started.authorizationUrl).toContain(encodeURIComponent("http://localhost:3000/"));

    // The same-tab redirect lands back on the app URL with the code.
    const state = localStorage.getItem("prosecraft-oauth-state");
    expect(state).toBeTruthy();
    window.history.replaceState(null, "", `/?code=test-code&state=${state}`);

    const result = await completeWebRedirectIfPresent();
    expect(result?.success).toBe(true);
    expect(result?.tokens?.accessToken).toBe("access");
    expect(result?.tokens?.refreshToken).toBe("refresh");
    // The code is single-use; the URL is cleaned so a reload does not retry.
    expect(window.location.search).toBe("");
    // The pending flow is consumed.
    expect(localStorage.getItem("prosecraft-oauth-code-verifier")).toBeNull();
  });
});
