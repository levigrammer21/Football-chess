import { initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  Transaction,
  DocumentReference,
} from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { Analytics, Call, Game, GamePlan, Profile, Snap } from "./model";
import { roster, starterPlays } from "./starters";
import { callSchema, idSchema, validatePlay } from "./validation";
import { advance, finish, newGame, publicSnap, simulate } from "./engine";
import { analytics, mergeAnalytics, record } from "./analytics";
initializeApp();
const db = getFirestore();
const options = {
  region: "us-central1",
  maxInstances: 20,
  timeoutSeconds: 60,
  memory: "512MiB" as const,
};
type Vault = {
  plans: Record<string, GamePlan>;
  calls: Record<string, Call>;
  stats: Record<string, Analytics>;
};
const userRef = (uid: string) => db.doc(`users/${uid}`);
function fail(message: string): never {
  throw new HttpsError("failed-precondition", message);
}
async function plan(tx: Transaction, uid: string) {
  const p = await tx.get(userRef(uid));
  if (!p.exists) fail("Complete your profile first.");
  const plays = await tx.get(db.collection(`users/${uid}/plays`));
  if (plays.size !== 10) fail("Save five offensive and five defensive plays.");
  return {
    profile: p.data() as Profile,
    plan: {
      roster: (p.data() as Profile).roster,
      plays: plays.docs.map((d) => validatePlay(d.data())),
    },
  };
}
async function finishWrites(tx: Transaction, g: Game, v: Vault) {
  const refs = g.members.map((uid) => db.doc(`users/${uid}/stats/career`));
  const stats = await Promise.all(refs.map((r) => tx.get(r)));
  const profiles = await Promise.all(
    g.members.map((uid) => tx.get(userRef(uid))),
  );
  const playRows = await Promise.all(
    g.members.flatMap((uid) =>
      Object.entries(v.stats[uid].plays).map(async ([key, value]) => {
        const ref = db.doc(
          `users/${uid}/playStats/${createHash("sha256").update(key).digest("hex")}`,
        );
        const old = await tx.get(ref);
        return { uid, key, value, ref, old };
      }),
    ),
  );
  g.members.forEach((uid, i) => {
    const a = v.stats[uid];
    a.games = 1;
    a.wins = Number(g.winner === uid);
    a.losses = Number(!!g.winner && g.winner !== uid);
    a.ties = Number(!g.winner);
    tx.set(db.doc(`games/${g.id}/reports/${uid}`), a);
    tx.set(
      refs[i],
      mergeAnalytics(
        stats[i].exists ? (stats[i].data() as Analytics) : analytics(),
        { ...a, plays: {} },
      ),
    );
    tx.update(userRef(uid), {
      activeGames: Math.max(0, (profiles[i].data()?.activeGames || 1) - 1),
    });
  });
  for (const row of playRows) {
    const prior = analytics(),
      next = analytics();
    if (row.old.exists) prior.plays[row.key] = row.old.data()!.value;
    next.plays[row.key] = row.value;
    tx.set(row.ref, {
      key: row.key,
      value: mergeAnalytics(prior, next).plays[row.key],
    });
  }
}
function defaultCall(g: Game, v: Vault, uid: string): Call {
  const offense = g.members[g.possession] === uid;
  return {
    playId: v.plans[uid].plays.find(
      (p) => p.side === (offense ? "offense" : "defense"),
    )!.id,
    mentality: "balanced",
    action:
      offense && g.phase === "conversion"
        ? "extraPoint"
        : offense && g.down === 4 && g.quarter <= 4
          ? "punt"
          : "play",
    turn: g.turn,
  };
}
function checkCall(g: Game, c: Call, uid: string, v: Vault) {
  if (c.turn !== g.turn) fail("This snap has already advanced.");
  if (v.calls[uid]) fail("Your call is already locked.");
  const offense = g.members[g.possession] === uid;
  if (
    !v.plans[uid].plays.some(
      (p) => p.id === c.playId && p.side === (offense ? "offense" : "defense"),
    )
  )
    fail("Choose a play from your locked game plan.");
  if (!offense && c.action !== "play")
    fail("Only the offense chooses a special-teams action.");
  if (offense) {
    if (
      g.phase === "conversion" &&
      !["extraPoint", "twoPoint"].includes(c.action)
    )
      fail("Choose an extra point or two-point try.");
    if (
      g.phase === "scrimmage" &&
      ["extraPoint", "twoPoint"].includes(c.action)
    )
      fail("No conversion is available.");
    if (g.quarter > 4 && c.action === "punt")
      fail("Punts are not available in overtime.");
  }
}
async function processGame(
  id: string,
  uid: string | null,
  c: Call | null,
  mode: "submit" | "timeout" | "forfeit",
) {
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`games/${id}`),
      vr = db.doc(`vaults/${id}`);
    const [gs, vs] = await Promise.all([tx.get(ref), tx.get(vr)]);
    if (!gs.exists) fail("Game not found.");
    let g = gs.data() as Game;
    const v = vs.data() as Vault;
    if (uid && !g.members.includes(uid))
      throw new HttpsError("permission-denied", "You are not in this game.");
    if (g.status !== "active") fail("This game is not active.");
    if (mode === "forfeit") {
      finish(
        g,
        now,
        g.members.find((x) => x !== uid),
      );
      g.lastSummary = `${g.names[g.members.indexOf(uid!)]} conceded`;
      await finishWrites(tx, g, v);
      tx.set(ref, g);
      tx.set(vr, v);
      return { gameId: id };
    }
    if (mode === "timeout") {
      if (g.deadline > now) fail("The selection clock is still running.");
      g.members.forEach((member, i) => {
        if (!v.calls[member]) {
          g.misses[i]++;
          v.calls[member] = defaultCall(g, v, member);
        }
      });
      if (g.misses.some((x) => x >= 3)) {
        const losers = g.misses
          .map((x, i) => (x >= 3 ? i : -1))
          .filter((x) => x >= 0);
        finish(
          g,
          now,
          losers.length === 1 ? g.members[1 - losers[0]] : undefined,
        );
        g.lastSummary = "Game ended after repeated missed calls";
        await finishWrites(tx, g, v);
        tx.set(ref, g);
        tx.set(vr, v);
        return { gameId: id };
      }
    } else if (c && uid) {
      if (now > g.deadline)
        fail("Selection clock expired. Resolve the timeout to continue.");
      checkCall(g, c, uid, v);
      v.calls[uid] = c;
      g.misses[g.members.indexOf(uid)] = 0;
    }
    g.locks = Object.keys(v.calls);
    if (g.members.every((member) => v.calls[member])) {
      const offUid = g.members[g.possession],
        defUid = g.members[1 - g.possession];
      const snap = simulate(
        g,
        v.plans[offUid],
        v.plans[defUid],
        v.calls[offUid],
        v.calls[defUid],
        randomBytes(4).readUInt32LE(),
      );
      record(v.stats[offUid], snap, true);
      record(v.stats[defUid], snap, false);
      g = advance(g, snap, now);
      v.calls = {};
      if (g.status === "complete") await finishWrites(tx, g, v);
      tx.create(
        db.doc(`games/${id}/snaps/${String(snap.turn).padStart(5, "0")}`),
        publicSnap(snap),
      );
      tx.create(
        db.doc(`games/${id}/film/${String(snap.turn).padStart(5, "0")}`),
        {
          ...snap,
          offPlay:
            v.plans[offUid].plays.find((p) => p.id === snap.offPlayId) ?? null,
          defPlay:
            v.plans[defUid].plays.find((p) => p.id === snap.defPlayId) ?? null,
        },
      );
    }
    tx.set(ref, g);
    tx.set(vr, v);
    return { gameId: id, turn: g.turn };
  });
}
export const coach = onCall(options, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Please sign in.");
  const uid = req.auth.uid;
  try {
    const kind = z
      .enum([
        "bootstrap",
        "profile",
        "savePlay",
        "create",
        "join",
        "submit",
        "timeout",
        "forfeit",
        "cancel",
      ])
      .parse(req.data?.kind);
    if (kind === "bootstrap") {
      const name = z.string().trim().min(2).max(24).parse(req.data.name);
      return await db.runTransaction(async (tx) => {
        const ref = userRef(uid);
        const current = await tx.get(ref);
        if (current.exists) return { ready: true };
        const profile: Profile = {
          uid,
          name,
          teamName: `${name}'s Club`,
          roster: roster(),
          createdAt: Date.now(),
          activeGames: 0,
        };
        tx.create(ref, profile);
        starterPlays().forEach((p) =>
          tx.create(db.doc(`users/${uid}/plays/${p.id}`), p),
        );
        tx.create(db.doc(`users/${uid}/stats/career`), analytics());
        return { ready: true };
      });
    }
    if (kind === "profile") {
      const name = z.string().trim().min(2).max(24).parse(req.data.name);
      const teamName = z
        .string()
        .trim()
        .min(2)
        .max(30)
        .parse(req.data.teamName);
      await userRef(uid).update({ name, teamName });
      return { saved: true };
    }
    if (kind === "savePlay") {
      const p = validatePlay(req.data.play);
      p.updatedAt = Date.now();
      await db.doc(`users/${uid}/plays/${p.id}`).set(p);
      return { saved: true };
    }
    if (kind === "create") {
      const id = randomBytes(6).toString("hex").toUpperCase();
      await db.runTransaction(async (tx) => {
        const team = await plan(tx, uid);
        if (team.profile.activeGames >= 5)
          fail("Finish or cancel a game before opening another.");
        const now = Date.now();
        tx.create(
          db.doc(`games/${id}`),
          newGame(id, uid, team.profile.teamName, now),
        );
        tx.create(db.doc(`vaults/${id}`), {
          plans: { [uid]: team.plan },
          calls: {},
          stats: { [uid]: analytics() },
        });
        tx.create(db.doc(`users/${uid}/plans/${id}`), team.plan);
        tx.update(userRef(uid), { activeGames: team.profile.activeGames + 1 });
      });
      return { gameId: id };
    }
    const id = idSchema.parse(req.data.gameId);
    if (kind === "join") {
      await db.runTransaction(async (tx) => {
        const ref = db.doc(`games/${id}`),
          vr = db.doc(`vaults/${id}`);
        const [gs, vs, team] = await Promise.all([
          tx.get(ref),
          tx.get(vr),
          plan(tx, uid),
        ]);
        if (!gs.exists) fail("Invite code not found.");
        const g = gs.data() as Game;
        const v = vs.data() as Vault;
        if (g.members.includes(uid)) fail("You cannot join both sides.");
        if (g.status !== "waiting" || g.members.length !== 1)
          fail("This invitation is no longer open.");
        if (g.deadline < Date.now()) fail("This invitation has expired.");
        if (team.profile.activeGames >= 5)
          fail("Finish or cancel a game first.");
        g.members.push(uid);
        g.names.push(team.profile.teamName);
        g.status = "active";
        g.deadline = Date.now() + 120000;
        g.lastSummary = "Opening possession";
        v.plans[uid] = team.plan;
        v.stats[uid] = analytics();
        tx.set(ref, g);
        tx.set(vr, v);
        tx.create(db.doc(`users/${uid}/plans/${id}`), team.plan);
        tx.update(userRef(uid), { activeGames: team.profile.activeGames + 1 });
      });
      return { gameId: id };
    }
    if (kind === "cancel") {
      await db.runTransaction(async (tx) => {
        const ref = db.doc(`games/${id}`);
        const [s, p] = await Promise.all([tx.get(ref), tx.get(userRef(uid))]);
        const g = s.data() as Game;
        if (!g || g.status !== "waiting" || g.members[0] !== uid)
          fail("Only your waiting invitations can be canceled.");
        finish(g, Date.now());
        g.lastSummary = "Invitation canceled";
        tx.set(ref, g);
        tx.update(userRef(uid), {
          activeGames: Math.max(0, (p.data()?.activeGames || 1) - 1),
        });
      });
      return { canceled: true };
    }
    return await processGame(
      id,
      uid,
      kind === "submit" ? callSchema.parse(req.data.call) : null,
      kind,
    );
  } catch (e) {
    if (e instanceof z.ZodError)
      throw new HttpsError(
        "invalid-argument",
        e.issues.map((i) => i.message).join("; "),
      );
    throw e;
  }
});
export const selectionClock = onSchedule(
  { schedule: "every 1 minutes", region: "us-central1", maxInstances: 1 },
  async () => {
    const due = await db
      .collection("games")
      .where("status", "==", "active")
      .where("deadline", "<=", Date.now())
      .limit(80)
      .get();
    for (const game of due.docs) {
      try {
        await processGame(game.id, null, null, "timeout");
      } catch (e) {
        console.warn(
          "Timeout skipped",
          game.id,
          e instanceof Error ? e.message : "changed",
        );
      }
    }
  },
);
