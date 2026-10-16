// API de données du bachelor : lit et écrit dans Netlify Blobs.
import { getStore } from "@netlify/blobs";

const ROSTER = ["alex-wallon", "ben-villeneuve", "jonathan-gaudreau", "julien-cote", "simon-auclair", "william-lemay-choquette"];
const WEEKS = ["2027-07-30", "2027-08-06", "2027-08-13", "2027-08-20", "2027-08-27", "2027-09-03", "2027-09-10", "2027-09-17", "2027-09-24"];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const strArr = (a, max, n) => (Array.isArray(a) ? a : []).map((x) => str(x, max)).filter(Boolean).slice(0, n);

function isAdmin(code) {
  const expected = Netlify.env.get("ADMIN_CODE");
  return !!expected && code === expected;
}

async function readAll(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const out = {};
  await Promise.all(blobs.map(async (b) => { out[b.key.slice(prefix.length)] = await store.get(b.key, { type: "json" }); }));
  return out;
}

export default async (req) => {
  const store = getStore({ name: "bachelor", consistency: "strong" });

  if (req.method === "GET") {
    const [trip, participants, ideas, votes] = await Promise.all([
      store.get("trip", { type: "json" }),
      readAll(store, "participants/"),
      store.get("ideas", { type: "json" }),
      readAll(store, "votes/"),
    ]);
    // Résumé anonyme pour tout le monde; les réponses détaillées seulement pour l'organisateur.
    const P = Object.values(participants).filter(Boolean);
    const budgets = P.map((p) => Number(p.budget)).filter((b) => b > 0).sort((a, b) => a - b);
    const weeks = {}, interests = {};
    P.forEach((p) => {
      (p.weeks || []).forEach((w) => { weeks[w] = (weeks[w] || 0) + 1; });
      (p.interests || []).forEach((i) => { interests[i] = (interests[i] || 0) + 1; });
    });
    const summary = {
      n: P.length,
      minBudget: budgets[0] ?? null,
      medBudget: budgets.length ? budgets[Math.floor((budgets.length - 1) / 2)] : null,
      maxTravel: P.length ? Math.min(...P.map((p) => Number(p.travel) || 4)) : 4,
      weeks, interests,
    };
    const admin = isAdmin(req.headers.get("x-admin-code") || "");
    const shown = {};
    for (const [id, p] of Object.entries(participants)) shown[id] = admin ? p : { answered: true };
    return json({ trip: trip || {}, participants: shown, summary, admin, ideas: ideas || [], votes, aiEnabled: !!Netlify.env.get("ANTHROPIC_API_KEY") });
  }

  if (req.method !== "POST") return json({ error: "Méthode non permise" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }
  const { action } = body || {};

  if (action === "participant") {
    const id = str(body.id, 60);
    if (!ROSTER.includes(id)) return json({ error: "Nom inconnu" }, 400);
    const budget = Number(body.budget);
    const travel = [2, 4, 6, 99].includes(Number(body.travel)) ? Number(body.travel) : 4;
    await store.setJSON("participants/" + id, {
      budget: budget > 0 && budget < 10000 ? Math.round(budget) : null,
      travel,
      weeks: strArr(body.weeks, 12, 12).filter((w) => WEEKS.includes(w)),
      interests: strArr(body.interests, 40, 20),
      notes: str(body.notes, 300),
      updatedAt: Date.now(),
    });
    return json({ ok: true });
  }

  if (action === "vote") {
    const id = str(body.voter, 60);
    if (!ROSTER.includes(id)) return json({ error: "Nom inconnu" }, 400);
    await store.setJSON("votes/" + id, { ideaId: str(body.ideaId, 40), updatedAt: Date.now() });
    return json({ ok: true });
  }

  if (action === "checkAdmin") return json({ ok: isAdmin(body.code) });

  // Actions réservées à l'organisateur
  if (!isAdmin(body.code)) return json({ error: "Code organisateur invalide" }, 403);

  if (action === "trip") {
    await store.setJSON("trip", {
      groom: str(body.groom, 40), from: str(body.from, 60),
      nights: [1, 2, 3].includes(Number(body.nights)) ? Number(body.nights) : 2,
      vibe: str(body.vibe, 120), updatedAt: Date.now(),
    });
    return json({ ok: true });
  }

  if (action === "ideas") {
    const batch = Date.now();
    const list = (Array.isArray(body.ideas) ? body.ideas : []).filter((o) => o && o.destination).slice(0, 4).map((o, k) => ({
      id: `b${batch}_${k}`,
      destination: str(o.destination, 80), headline: str(o.headline, 160),
      travelTime: str(o.travelTime, 40), costPerPerson: str(o.costPerPerson, 40),
      lodging: strArr(o.lodging, 200, 4), activities: strArr(o.activities, 200, 6),
      why: str(o.why, 300), searchArea: str(o.searchArea || o.destination, 80),
    }));
    if (!list.length) return json({ error: "Aucune idée valide" }, 400);
    await store.setJSON("ideas", list);
    const { blobs } = await store.list({ prefix: "votes/" });
    await Promise.all(blobs.map((b) => store.delete(b.key)));
    return json({ ok: true });
  }

  if (action === "deleteParticipant") {
    const id = str(body.id, 60);
    await store.delete("participants/" + id);
    await store.delete("votes/" + id);
    return json({ ok: true });
  }

  return json({ error: "Action inconnue" }, 400);
};

export const config = { path: "/api/data" };
