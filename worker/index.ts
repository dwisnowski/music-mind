import {
  authorizePrivateScores,
  privateObjectKey,
  type AccessEnv,
} from "./access";

function accessEnv(env: Env): AccessEnv {
  const e = env as Env & AccessEnv;
  return {
    CF_ACCESS_TEAM_DOMAIN: e.CF_ACCESS_TEAM_DOMAIN,
    CF_ACCESS_AUD: e.CF_ACCESS_AUD,
    OWNER_EMAILS: e.OWNER_EMAILS,
    PRIVATE_SCORES_DEV_BYPASS: e.PRIVATE_SCORES_DEV_BYPASS,
  };
}

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, app: "music-mind" });
    }

    if (url.pathname === "/api/private-scores/me") {
      const auth = await authorizePrivateScores(request, accessEnv(env));
      if (!auth.ok) {
        return Response.json(
          { ok: false, error: auth.message },
          { status: auth.status },
        );
      }
      // Browser navigations (Access OTP return) get an HTML bounce back to the SPA
      // so users do not land on raw JSON. XHR/fetch still get JSON.
      const mode = request.headers.get("Sec-Fetch-Mode");
      const accept = request.headers.get("Accept") ?? "";
      const wantsHtml =
        mode === "navigate" || accept.includes("text/html");
      if (wantsHtml) {
        return new Response(
          `<!DOCTYPE html><html lang="en"><meta charset="utf-8"/><title>Signed in</title><meta http-equiv="refresh" content="0;url=/"/><script>location.replace("/")</script><p>Signed in. <a href="/">Continue to Music Mind</a></p></html>`,
          {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "private, no-store",
            },
          },
        );
      }
      return Response.json({ ok: true, email: auth.email });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const objectKey = privateObjectKey(url.pathname);
    if (objectKey) {
      const auth = await authorizePrivateScores(request, accessEnv(env));
      if (!auth.ok) {
        return new Response(auth.message, {
          status: auth.status,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "private, no-store",
          },
        });
      }

      const value = await env.PRIVATE_SCORES.get(objectKey, "arrayBuffer");
      if (!value) {
        return new Response("Score not found", {
          status: 404,
          headers: { "Cache-Control": "private, no-store" },
        });
      }

      const lower = objectKey.toLowerCase();
      const contentType = lower.endsWith(".mxl")
        ? "application/vnd.recordare.musicxml"
        : "application/vnd.recordare.musicxml+xml";

      return new Response(value, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
