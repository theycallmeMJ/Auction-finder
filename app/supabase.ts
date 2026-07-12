const SUPABASE_URL_KEY = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const VITE_SUPABASE_URL_KEY = "VITE_SUPABASE_URL";
const VITE_SUPABASE_ANON_KEY = "VITE_SUPABASE_ANON_KEY";
const AUTH_REDIRECT_URL_KEY = "NEXT_PUBLIC_AUTH_REDIRECT_URL";
const VITE_AUTH_REDIRECT_URL_KEY = "VITE_AUTH_REDIRECT_URL";

type SupabaseEnv = Record<string, string | undefined>;

type SupabaseRow<T> = {
  payload: T;
};

export type SupabaseAuthSession = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: unknown;
};

export const SUPABASE_SESSION_STORAGE_KEY = "kerala-auction-finder-session";

function readEnv(key: string) {
  const processEnv = (globalThis as { process?: { env?: SupabaseEnv } }).process?.env ?? {};
  const viteEnv = (import.meta as unknown as { env?: SupabaseEnv }).env ?? {};
  return processEnv[key] ?? viteEnv[key];
}

function getSupabaseConfig() {
  const url = (readEnv(SUPABASE_URL_KEY) ?? readEnv(VITE_SUPABASE_URL_KEY))?.replace(/\/$/, "");
  const anonKey = readEnv(SUPABASE_ANON_KEY) ?? readEnv(VITE_SUPABASE_ANON_KEY);
  return url && anonKey ? { url, anonKey } : null;
}

export function hasSupabaseConfig() {
  return Boolean(getSupabaseConfig());
}

async function fetchSupabase<T>(path: string) {
  const config = getSupabaseConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function writeSupabase(path: string, body: unknown, accessToken: string) {
  const config = getSupabaseConfig();
  if (!config) return;

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Supabase write failed: ${response.status}`);
  }
}

async function authRequest<T>(path: string, body?: unknown, accessToken?: string) {
  const config = getSupabaseConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken ?? config.anonKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Supabase auth request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function getRedirectTo() {
  if (typeof window === "undefined") return undefined;
  const configuredRedirect = readEnv(AUTH_REDIRECT_URL_KEY) ?? readEnv(VITE_AUTH_REDIRECT_URL_KEY);
  if (configuredRedirect) {
    return configuredRedirect.replace(/\/$/, "");
  }
  return `${window.location.origin}${window.location.pathname}`;
}

export async function fetchSupabaseAuctions<T>() {
  const rows = await fetchSupabase<SupabaseRow<T>[]>(
    "auctions?select=payload&order=score.desc.nullslast,start_at.asc&limit=5000",
  );
  return rows?.map((row) => row.payload) ?? null;
}

export async function fetchSupabaseCatalog<T>() {
  const rows = await fetchSupabase<SupabaseRow<T>[]>(
    "catalog_snapshots?select=payload&kind=eq.kerala_catalog&order=created_at.desc&limit=1",
  );
  return rows?.[0]?.payload ?? null;
}

export function signUpWithEmail(email: string, password: string) {
  return authRequest<SupabaseAuthSession>("signup", { email, password });
}

export function signInWithEmail(email: string, password: string) {
  return authRequest<SupabaseAuthSession>("token?grant_type=password", { email, password });
}

export async function sendMagicLink(email: string) {
  const redirectTo = getRedirectTo();
  const path = redirectTo ? `otp?redirect_to=${encodeURIComponent(redirectTo)}` : "otp";
  await authRequest<Record<string, never>>(path, {
    email,
    create_user: true,
  });
}

export function signInWithGoogle() {
  const config = getSupabaseConfig();
  const redirectTo = getRedirectTo();
  if (!config || !redirectTo) return;

  const url = new URL(`${config.url}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectTo);
  window.location.href = url.toString();
}

export function readSessionFromUrl() {
  if (typeof window === "undefined" || !window.location.hash.includes("access_token")) {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  if (!accessToken) return null;

  const session: SupabaseAuthSession = {
    access_token: accessToken,
    refresh_token: params.get("refresh_token") ?? undefined,
    expires_in: Number(params.get("expires_in") ?? 0) || undefined,
    token_type: params.get("token_type") ?? undefined,
  };

  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return session;
}

function decodeJwtPayload(accessToken: string) {
  const [, payload] = accessToken.split(".");
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return JSON.parse(decoded) as {
      app_metadata?: { provider?: string; providers?: string[] };
      email?: string;
      exp?: number;
      iat?: number;
      session_id?: string;
      sub?: string;
    };
  } catch {
    return null;
  }
}

export function getSessionEventKey(accessToken: string) {
  const payload = decodeJwtPayload(accessToken);
  return [payload?.sub, payload?.session_id ?? payload?.iat ?? payload?.exp]
    .filter(Boolean)
    .join(":");
}

export async function recordLoginEvent(accessToken: string, source: string) {
  const payload = decodeJwtPayload(accessToken);
  if (!payload?.sub) return;

  await writeSupabase(
    "login_events",
    {
      user_id: payload.sub,
      email: payload.email ?? null,
      provider: payload.app_metadata?.provider ?? payload.app_metadata?.providers?.[0] ?? null,
      source,
      path: typeof window === "undefined" ? null : window.location.pathname,
      user_agent: typeof navigator === "undefined" ? null : navigator.userAgent,
      metadata: {
        providers: payload.app_metadata?.providers ?? [],
      },
    },
    accessToken,
  );
}

export function getCurrentUser(accessToken: string) {
  return authRequest<unknown>("user", undefined, accessToken);
}

export async function signOut(accessToken: string) {
  await authRequest<Record<string, never>>("logout", {}, accessToken);
}
