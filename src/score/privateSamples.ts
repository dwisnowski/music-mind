import type { SampleScore } from "./samples";

/** Personal scores gated by Cloudflare Access + Worker allowlist (ADR 0018). */
export const PRIVATE_SAMPLE_SCORES: SampleScore[] = [
  {
    id: "private-girl-rush",
    title: "Girl Rush",
    composer: "Personal",
    path: "/samples/private/girl-rush.musicxml",
  },
  {
    id: "private-mad-world",
    title: "Mad World",
    composer: "Personal",
    path: "/samples/private/mad-world.musicxml",
  },
  {
    id: "private-moonlight-sonata",
    title: "Moonlight Sonata (theme)",
    composer: "L. van Beethoven",
    path: "/samples/private/moonlight-sonata.musicxml",
  },
  {
    id: "private-gymnopedie-no1",
    title: "Gymnopédie No. 1 (fingered)",
    composer: "Erik Satie",
    path: "/samples/private/gymnopedie-no1.musicxml",
  },
  {
    id: "private-love-story",
    title: "Love Story",
    composer: "Personal",
    path: "/samples/private/love-story.musicxml",
  },
  {
    id: "private-beat-it",
    title: "Beat It",
    composer: "Personal",
    path: "/samples/private/beat-it.musicxml",
  },
  {
    id: "private-without-me",
    title: "Without Me",
    composer: "Personal",
    path: "/samples/private/without-me.musicxml",
  },
  {
    id: "private-carol-of-the-bells",
    title: "Carol of the Bells",
    composer: "Personal",
    path: "/samples/private/carol-of-the-bells.musicxml",
  },
  {
    id: "private-canon-in-d",
    title: "Canon in D",
    composer: "J. Pachelbel",
    path: "/samples/private/canon-in-d.musicxml",
  },
  {
    id: "private-im-good-blue",
    title: "I'm Good (Blue)",
    composer: "Personal",
    path: "/samples/private/im-good-blue.musicxml",
  },
  {
    id: "private-bohemian-rhapsody",
    title: "Bohemian Rhapsody",
    composer: "Personal",
    path: "/samples/private/bohemian-rhapsody.musicxml",
  },
];

export function isPrivateSamplePath(path: string): boolean {
  return path.startsWith("/samples/private/");
}

/** sessionStorage key: resume this private score path after Access OTP. */
export const PENDING_PRIVATE_SAMPLE_KEY = "music-mind:pending-private-sample";

/**
 * Full-page Access login. Never fetch() the Access login host — that hits CORS.
 * After OTP, `/api/private-scores/me` bounces back to the SPA.
 */
export function beginPrivateAccessSignIn(pendingSamplePath?: string): void {
  try {
    if (pendingSamplePath && isPrivateSamplePath(pendingSamplePath)) {
      sessionStorage.setItem(PENDING_PRIVATE_SAMPLE_KEY, pendingSamplePath);
    } else {
      sessionStorage.removeItem(PENDING_PRIVATE_SAMPLE_KEY);
    }
  } catch {
    /* private mode / quota */
  }
  window.location.assign("/api/private-scores/me");
}

export function takePendingPrivateSamplePath(): string | null {
  try {
    const path = sessionStorage.getItem(PENDING_PRIVATE_SAMPLE_KEY);
    if (path) sessionStorage.removeItem(PENDING_PRIVATE_SAMPLE_KEY);
    return path && isPrivateSamplePath(path) ? path : null;
  } catch {
    return null;
  }
}

export type PrivateScoreFetchResult =
  | { kind: "ok"; buffer: ArrayBuffer }
  | { kind: "needs-sign-in" }
  | { kind: "forbidden"; message: string }
  | { kind: "error"; message: string };

/**
 * Load a score URL. Private paths use redirect:manual so Access 302s do not
 * follow cross-origin into a CORS failure; instead we signal needs-sign-in.
 */
export async function fetchScoreBytes(path: string): Promise<PrivateScoreFetchResult> {
  const privatePath = isPrivateSamplePath(path);
  try {
    const res = await fetch(path, {
      credentials: privatePath ? "include" : "same-origin",
      redirect: privatePath ? "manual" : "follow",
    });

    if (privatePath) {
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        return { kind: "needs-sign-in" };
      }
      if (res.status === 401 || res.status === 403) {
        const body = (await res.text().catch(() => "")).trim();
        return {
          kind: "forbidden",
          message:
            body ||
            "Sign in with Cloudflare Access to load personal scores.",
        };
      }
    }

    if (!res.ok) {
      return { kind: "error", message: `Could not load score (${res.status}).` };
    }
    return { kind: "ok", buffer: await res.arrayBuffer() };
  } catch (err) {
    if (privatePath) {
      // Failed CORS follow of Access login (if redirect was not manual).
      return { kind: "needs-sign-in" };
    }
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
