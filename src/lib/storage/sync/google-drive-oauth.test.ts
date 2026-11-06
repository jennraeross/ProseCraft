import { afterEach, describe, expect, it, vi } from "vitest";
import {
  exchangeCodeForToken,
  isTokenExpired,
  parseAuthorizationInput,
  refreshAccessToken
} from "./google-drive-oauth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
