import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AccessEnv {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  OWNER_EMAILS?: string;
  /** When "1", allow local wrangler/vite without Access JWT (never set in production). */
  PRIVATE_SCORES_DEV_BYPASS?: string;
}

function normalizeTeamDomain(raw: string): string {
  let team = raw.trim();
  for (const prefix of ["https://", "http://"] as const) {
    if (team.startsWith(prefix)) team = team.slice(prefix.length);
  }
  return team.replace(/\/+$/, "");
}

function ownerEmails(env: AccessEnv): Set<string> {
  const raw = (env.OWNER_EMAILS ?? "dwisnows@gmail.com").trim();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || null;
  }
  return null;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksForTeam(team: string) {
  let jwks = jwksCache.get(team);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://${team}/cdn-cgi/access/certs`),
    );
    jwksCache.set(team, jwks);
  }
  return jwks;
}

export type AccessResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403; message: string };

/**
 * Verify Cloudflare Access identity and allowlist for private score routes.
 * Production fails closed when Access secrets are unset.
 */
export async function authorizePrivateScores(
  request: Request,
  env: AccessEnv,
): Promise<AccessResult> {
  const owners = ownerEmails(env);
  const teamRaw = (env.CF_ACCESS_TEAM_DOMAIN ?? "").trim();
  const aud = (env.CF_ACCESS_AUD ?? "").trim();

  if (!teamRaw || !aud) {
    // Local wrangler/vite only — never honor bypass when Access AUD is configured
    // or when the Host is the public production domain.
    const host = new URL(request.url).hostname;
    const isProdHost =
      host === "musicmind.wildideazone.com" || host.endsWith(".musicmind.wildideazone.com");
    if (!isProdHost && env.PRIVATE_SCORES_DEV_BYPASS === "1") {
      const first = [...owners][0] ?? "dev@localhost";
      return { ok: true, email: first };
    }
    return {
      ok: false,
      status: 403,
      message: "Private scores are not configured on this deployment",
    };
  }

  const team = normalizeTeamDomain(teamRaw);
  const issuer = `https://${team}`;
  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    cookieValue(request, "CF_Authorization");

  if (!token) {
    return {
      ok: false,
      status: 401,
      message: "Sign in with Cloudflare Access to load personal scores",
    };
  }

  try {
    const { payload } = await jwtVerify(token, jwksForTeam(team), {
      issuer,
      audience: aud,
    });
    const email = String(payload.email ?? "")
      .trim()
      .toLowerCase();
    if (!email) {
      return { ok: false, status: 403, message: "Access token has no email" };
    }
    if (!owners.has(email)) {
      return {
        ok: false,
        status: 403,
        message: "This account is not allowed to load personal scores",
      };
    }
    return { ok: true, email };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid Access token";
    return { ok: false, status: 403, message };
  }
}

/** Object key from `/samples/private/<file>` — basename only, no path traversal. */
export function privateObjectKey(pathname: string): string | null {
  const prefix = "/samples/private/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  if (!rest || rest.includes("/") || rest.includes("..")) return null;
  if (!/\.(mxl|musicxml)$/i.test(rest)) return null;
  return rest;
}
