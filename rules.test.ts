import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
let env: RulesTestEnvironment;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-gridiron",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await Promise.all([
      setDoc(doc(db, "users/alice"), { name: "Alice" }),
      setDoc(doc(db, "users/alice/plays/offense-1"), { routes: [] }),
      setDoc(doc(db, "games/RULETEST0001"), {
        members: ["alice", "bob"],
        status: "active",
      }),
      setDoc(doc(db, "games/RULETEST0001/snaps/00000"), { yards: 4 }),
      setDoc(doc(db, "games/RULETEST0001/film/00000"), {
        reads: ["WR1", "RB"],
      }),
      setDoc(doc(db, "games/RULETEST0001/reports/alice"), { wins: 1 }),
      setDoc(doc(db, "vaults/RULETEST0001"), { calls: { alice: "offense-1" } }),
    ]);
  });
});
after(async () => {
  await env.cleanup();
});
test("users cannot read opponent profile/playbook or mutate ratings", async () => {
  const db = env.authenticatedContext("bob").firestore();
  await assertFails(getDoc(doc(db, "users/alice")));
  await assertFails(getDoc(doc(db, "users/alice/plays/offense-1")));
  await assertFails(setDoc(doc(db, "users/bob"), { ratings: 100 }));
});
test("own playbook readable; all official writes rejected", async () => {
  const db = env.authenticatedContext("alice").firestore();
  await assertSucceeds(getDoc(doc(db, "users/alice/plays/offense-1")));
  for (const path of [
    "games/RULETEST0001",
    "games/RULETEST0001/snaps/00000",
    "users/alice/stats/career",
    "users/alice/plays/offense-1",
    "users/alice/plans/RULETEST0001",
  ])
    await assertFails(setDoc(doc(db, path), { score: 100 }));
});
test("vault and hidden film never readable in active games", async () => {
  for (const uid of ["alice", "bob", "outsider"]) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, "vaults/RULETEST0001")));
    await assertFails(getDoc(doc(db, "games/RULETEST0001/film/00000")));
  }
});
test("only participants read snaps; member-filtered queries work", async () => {
  await assertSucceeds(
    getDoc(
      doc(
        env.authenticatedContext("bob").firestore(),
        "games/RULETEST0001/snaps/00000",
      ),
    ),
  );
  await assertFails(
    getDoc(
      doc(
        env.authenticatedContext("outsider").firestore(),
        "games/RULETEST0001/snaps/00000",
      ),
    ),
  );
  await assertFails(
    getDoc(doc(env.unauthenticatedContext().firestore(), "games/RULETEST0001")),
  );
  const db = env.authenticatedContext("alice").firestore();
  const s = await assertSucceeds(
    getDocs(
      query(
        collection(db, "games"),
        where("members", "array-contains", "alice"),
      ),
    ),
  );
  assert.ok(s.size >= 1);
});
test("completion unlocks film and reports for both participants only", async () => {
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "games/RULETEST0001"), { status: "complete" }),
  );
  for (const uid of ["alice", "bob"])
    await assertSucceeds(
      getDoc(
        doc(
          env.authenticatedContext(uid).firestore(),
          "games/RULETEST0001/film/00000",
        ),
      ),
    );
  await assertSucceeds(
    getDoc(
      doc(
        env.authenticatedContext("bob").firestore(),
        "games/RULETEST0001/reports/alice",
      ),
    ),
  );
  await assertFails(
    getDoc(
      doc(
        env.authenticatedContext("outsider").firestore(),
        "games/RULETEST0001/film/00000",
      ),
    ),
  );
});
