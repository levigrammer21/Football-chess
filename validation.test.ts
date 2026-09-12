import { test } from "node:test";
import assert from "node:assert/strict";
import { starterPlays } from "./starters";
import { validatePlay, callSchema, idSchema } from "./validation";
test("all ten starter slots validate", () =>
  starterPlays().forEach((p) => assert.equal(validatePlay(p).id, p.id)));
test("cannot inject ratings, duplicate reads, missing defenders, or invalid geometry", () => {
  for (const mutate of [
    (p: any) => (p.ratings = { accuracy: 100 }),
    (p: any) => (p.reads = ["WR1", "WR1"]),
    (p: any) => delete p.assignments.CB1,
    (p: any) => (p.routes.WR1[0].x = 999),
    (p: any) => (p.routes.WR1[0].x = NaN),
    (p: any) => (p.id = "defense-1"),
    (p: any) => (p.routes.WR1 = Array(65).fill({ x: 1, y: 1 })),
  ]) {
    const p = starterPlays()[0];
    mutate(p);
    assert.throws(() => validatePlay(p));
  }
});
test("rejects invalid calls and document path injection", () => {
  assert.throws(() => idSchema.parse("../vaults"));
  assert.throws(() =>
    callSchema.parse({
      playId: "offense-1",
      turn: 0,
      mentality: "invincible",
      action: "play",
    }),
  );
});
