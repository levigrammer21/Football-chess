import { test, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp, FirebaseApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
} from "firebase/firestore";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import { Game, GamePlan, Play, Analytics } from "./model";
import {
  initializeApp as adminApp,
  deleteApp as deleteAdminApp,
} from "firebase-admin/app";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
const apps: FirebaseApp[] = [];
async function client(n: string) {
  const app = initializeApp(
    {
      projectId: "demo-gridiron",
      apiKey: "demo-key",
      authDomain: "demo-gridiron.firebaseapp.com",
    },
    n + Date.now(),
  );
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const f = getFunctions(app);
  connectFunctionsEmulator(f, "127.0.0.1", 5001);
  const invoke = httpsCallable<Record<string, unknown>, any>(f, "coach");
  return {
    auth,
    db,
    call: async (data: Record<string, unknown>) => (await invoke(data)).data,
  };
}
after(async () => {
  await Promise.all(apps.map(deleteApp));
});
test("real Firebase emulator account → design → PvP → completed film and analytics", async () => {
  const a = await client("a"),
    b = await client("b"),
    emailA = `a${Date.now()}@example.test`,
    emailB = `b${Date.now()}@example.test`;
  const password = "Testing-football-123";
  const ua = (await createUserWithEmailAndPassword(a.auth, emailA, password))
      .user.uid,
    ub = (await createUserWithEmailAndPassword(b.auth, emailB, password)).user
      .uid;
  await Promise.all([
    a.call({ kind: "bootstrap", name: "Coach A" }),
    b.call({ kind: "bootstrap", name: "Coach B" }),
  ]);
  await a.call({ kind: "bootstrap", name: "Do not reset" });
  assert.equal(
    (await getDocs(collection(a.db, "users", ua, "plays"))).size,
    10,
  );
  const p = (
    await getDoc(doc(a.db, "users", ua, "plays", "offense-1"))
  ).data() as Play;
  p.name = "Custom Mobile Post";
  p.routes.WR1 = [
    { x: 5, y: 0 },
    { x: 5, y: 10 },
    { x: 23, y: 28 },
  ];
  p.routes.RB = [
    { x: 23, y: -7 },
    { x: 15, y: -2 },
    { x: 3, y: 5 },
  ];
  p.reads = ["WR1", "RB"];
  await a.call({ kind: "savePlay", play: p });
  assert.deepEqual(
    (await getDoc(doc(a.db, "users", ua, "plays", p.id))).data()?.routes,
    p.routes,
  );
  const dp = (
    await getDoc(doc(b.db, "users", ub, "plays", "defense-1"))
  ).data() as Play;
  dp.assignments.CB1 = {
    kind: "zone",
    target: "WR1",
    center: { x: 8, y: 12 },
    radius: 9,
  };
  await b.call({ kind: "savePlay", play: dp });
  assert.equal(
    (await getDoc(doc(b.db, "users", ub, "plays", dp.id))).data()?.assignments
      .CB1.radius,
    9,
  );
  await signOut(a.auth);
  assert.equal(a.auth.currentUser, null);
  assert.equal(
    (await signInWithEmailAndPassword(a.auth, emailA, password)).user.uid,
    ua,
  );
  assert.equal(
    (await getDoc(doc(a.db, "users", ua, "plays", p.id))).data()?.name,
    p.name,
  );
  const { gameId } = await a.call({ kind: "create" });
  await assert.rejects(a.call({ kind: "join", gameId }));
  await b.call({ kind: "join", gameId });
  await assert.rejects(b.call({ kind: "join", gameId }));
  const plan = (
    await getDoc(doc(a.db, "users", ua, "plans", gameId))
  ).data() as GamePlan;
  assert.equal(plan.plays.find((x) => x.id === p.id)?.name, p.name);
  p.name = "Changed after kickoff";
  await a.call({ kind: "savePlay", play: p });
  assert.equal(
    (await getDoc(doc(a.db, "users", ua, "plans", gameId)))
      .data()
      ?.plays.find((x: Play) => x.id === p.id)?.name,
    "Custom Mobile Post",
  );
  let g = (await getDoc(doc(a.db, "games", gameId))).data() as Game;
  const ca = {
      playId: "offense-1",
      mentality: "balanced",
      action: "play",
      turn: 0,
    },
    cb = { ...ca, playId: "defense-1" };
  await assert.rejects(b.call({ kind: "submit", gameId, call: ca }));
  await a.call({ kind: "submit", gameId, call: ca });
  await assert.rejects(a.call({ kind: "submit", gameId, call: ca }));
  assert.equal((await getDoc(doc(b.db, "games", gameId))).data()?.turn, 0);
  await assert.rejects(getDoc(doc(b.db, "vaults", gameId)));
  await assert.rejects(getDoc(doc(b.db, "users", ua, "plans", gameId)));
  await assert.rejects(setDoc(doc(a.db, "games", gameId), { score: [100, 0] }));
  await assert.rejects(a.call({ kind: "timeout", gameId }));
  await b.call({ kind: "submit", gameId, call: cb });
  const sA = (
      await getDoc(doc(a.db, "games", gameId, "snaps", "00000"))
    ).data(),
    sB = (await getDoc(doc(b.db, "games", gameId, "snaps", "00000"))).data();
  assert.deepEqual(sA, sB);
  assert.ok(!("read" in sA!));
  assert.ok(!("offPlayName" in sA!));
  await assert.rejects(getDoc(doc(a.db, "games", gameId, "film", "00000")));
  // A fresh authenticated client reconnects to the same official turn.
  const reconnect = await client("reconnect");
  await signInWithEmailAndPassword(reconnect.auth, emailA, password);
  assert.equal(
    (await getDoc(doc(reconnect.db, "games", gameId))).data()?.turn,
    1,
  );
  for (let n = 1; n < 250; n++) {
    g = (await getDoc(doc(a.db, "games", gameId))).data() as Game;
    if (g.status === "complete") break;
    const offense = g.members[g.possession] === ua ? a : b,
      defense = offense === a ? b : a;
    const action =
      g.phase === "conversion"
        ? "extraPoint"
        : g.down === 4
          ? g.spot > 55 || g.quarter > 4
            ? "fieldGoal"
            : "punt"
          : "play";
    const offenseCall = {
      playId: `offense-${(n % 5) + 1}`,
      mentality: n % 2 ? "aggressive" : "balanced",
      action,
      turn: g.turn,
    };
    const defenseCall = {
      playId: `defense-${(n % 5) + 1}`,
      mentality: "balanced",
      action: "play",
      turn: g.turn,
    };
    await Promise.all([
      offense.call({ kind: "submit", gameId, call: offenseCall }),
      defense.call({ kind: "submit", gameId, call: defenseCall }),
    ]);
  }
  g = (await getDoc(doc(a.db, "games", gameId))).data() as Game;
  assert.equal(g.status, "complete");
  assert.ok(g.turn > 20);
  const snaps = await getDocs(collection(a.db, "games", gameId, "snaps")),
    film = await getDocs(collection(a.db, "games", gameId, "film"));
  assert.equal(snaps.size, g.turn);
  assert.equal(film.size, g.turn);
  assert.equal(film.docs[0].data().offPlay.name, "Custom Mobile Post");
  const stat = (
    await getDoc(doc(a.db, "users", ua, "stats", "career"))
  ).data() as Analytics;
  assert.equal(stat.games, 1);
  assert.ok(stat.team.calls > 0);
  assert.ok(Object.keys(stat.players).length > 0);
  assert.ok(
    (await getDocs(collection(a.db, "users", ua, "playStats"))).size > 0,
  );
  assert.ok((await getDoc(doc(b.db, "games", gameId, "reports", ua))).exists());
  await assert.rejects(a.call({ kind: "submit", gameId, call: ca }));
  assert.equal(
    (await getDoc(doc(a.db, "users", ua, "stats", "career"))).data()?.games,
    1,
  );
  // Test timeout fallback and consecutive missed-call forfeiture using emulator-only clock advancement.
  assert.equal(process.env.GCLOUD_PROJECT, "demo-gridiron");
  const admin = adminApp({ projectId: "demo-gridiron" }, "timeout-test");
  const dbAdmin = adminFirestore(admin);
  const next = await a.call({ kind: "create" });
  await b.call({ kind: "join", gameId: next.gameId });
  for (let miss = 1; miss <= 3; miss++) {
    const state = (
      await getDoc(doc(a.db, "games", next.gameId))
    ).data() as Game;
    const side = state.members[state.possession] === ua ? "offense" : "defense";
    await a.call({
      kind: "submit",
      gameId: next.gameId,
      call: {
        playId: `${side}-1`,
        turn: state.turn,
        mentality: "balanced",
        action:
          side === "offense" && state.phase === "conversion"
            ? "extraPoint"
            : "play",
      },
    });
    await dbAdmin
      .doc(`games/${next.gameId}`)
      .update({ deadline: Date.now() - 1 });
    await a.call({ kind: "timeout", gameId: next.gameId });
  }
  const timed = (await getDoc(doc(a.db, "games", next.gameId))).data() as Game;
  assert.equal(timed.status, "complete");
  assert.equal(timed.winner, ua);
  assert.equal(timed.misses[1], 3);
  assert.equal((await getDoc(doc(a.db, "users", ua))).data()?.activeGames, 0);
  await deleteAdminApp(admin);
  console.log(
    `Completed ${gameId}: ${g.score.join("–")}, ${g.turn} authoritative snaps; accounts, reconnect, secrecy, film and statistics verified.`,
  );
});
