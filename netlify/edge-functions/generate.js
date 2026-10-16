// Relais vers l'API Claude (en streaming) pour générer les idées.
// La clé API reste sur le serveur; seul l'organisateur (code ADMIN_CODE) peut l'utiliser.
export default async (req) => {
  if (req.method !== "POST") return new Response("Méthode non permise", { status: 405 });
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  const admin = Netlify.env.get("ADMIN_CODE");
  if (!key) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY manquante" }), { status: 501 });

  let body;
  try { body = await req.json(); } catch { return new Response("Requête invalide", { status: 400 }); }
  if (!admin || body.code !== admin) return new Response(JSON.stringify({ error: "Code organisateur invalide" }), { status: 403 });

  const prompt = String(body.prompt || "").slice(0, 6000);
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: Netlify.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5",
      max_tokens: 3000,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "text/event-stream", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/generate" };
