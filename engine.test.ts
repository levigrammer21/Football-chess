import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  newGame,
  simulate,
  routePosition,
  publicSnap,
} from "./engine";
import { roster, starterPlays } from "./starters";
import { analytics, record, mergeAnalytics } from "./analytics";
import { Call, Game, GamePlan, Snap } from "./model";
const team = (): GamePlan => ({ roster: roster(), plays: starterPlays() });
const call = (
  side = "offense",
  mentality: Call["mentality"] = "balanced",
): Call => ({ playId: `${side}-1`, action: "play", mentality, turn: 0 });
const game = (): Game => ({
  ...newGame("ABCDEF012345", "a", "A", 0),
  members: ["a", "b"],
  names: ["A", "B"],
  status: "active",
});
function snap(overrides: Partial<Snap> = {}): Snap {
  return {
    ...simulate(game(), team(), team(), call(), call("defense"), 5),
    outcome: "complete",
    yards: 5,
    td: false,
    safety: false,
    conversion: false,
    points: 0,
    duration: 25,
    ...overrides,
  };
}
test("waypoints are traveled in order, including bends", () => {
  assert.deepEqual(
    routePosition(
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
      ],
      15,
    ),
    { x: 5, y: 10 },
  );
});
test("same seed and state produce identical official replay", () => {
  const g = game();
  assert.deepEqual(
    simulate(g, team(), team(), call(), call("defense"), 83),
    simulate(g, team(), team(), call(), call("defense"), 83),
  );
});
test("quarterback only targets primary or secondary across seeds", () => {
  for (let i = 0; i < 100; i++) {
    const t = team(),
      s = simulate(game(), t, team(), call(), call("defense"), i);
    assert.ok(s.target === null || t.plays[0].reads.includes(s.target));
    assert.ok(s.frames.length > 1);
    assert.equal(Object.keys(s.frames[0].players).length, 22);
    assert.ok(s.frames.every((f) => Number.isFinite(f.ball.y)));
  }
});
test("off-path decoy follows its actual custom waypoints", () => {
  const t = team();
  t.plays[0].routes.WR2 = [
    { x: 47, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 20 },
  ];
  const s = simulate(game(), t, team(), call(), call("defense"), 31);
  assert.ok(s.frames.some((f) => f.players["O:WR2"].x < 45));
  assert.ok(s.frames.slice(1, 5).every((f) => f.players["O:WR2"].y === 0));
});
test("ratings and mentality produce material statistical effects", () => {
  const strong = team(),
    weak = team();
  for (const p of strong.roster)
    for (const key of Object.keys(p.ratings))
      p.ratings[key as keyof typeof p.ratings] = 95;
  for (const p of weak.roster)
    for (const key of Object.keys(p.ratings))
      p.ratings[key as keyof typeof p.ratings] = 45;
  let strongYards = 0,
    weakYards = 0,
    different = 0;
  for (let i = 1; i <= 150; i++) {
    strongYards += simulate(
      game(),
      strong,
      team(),
      call(),
      call("defense"),
      i,
    ).yards;
    weakYards += simulate(
      game(),
      weak,
      team(),
      call(),
      call("defense"),
      i,
    ).yards;
    const c = simulate(
      game(),
      team(),
      team(),
      call("offense", "conservative"),
      call("defense"),
      i,
    );
    const a = simulate(
      game(),
      team(),
      team(),
      call("offense", "aggressive"),
      call("defense"),
      i,
    );
    if (c.outcome !== a.outcome || c.timeToThrow !== a.timeToThrow) different++;
  }
  assert.ok(strongYards > weakYards, `${strongYards} versus ${weakYards}`);
  assert.ok(different > 30, `${different} changed`);
});
test("downs, first downs, turnover on downs, field reversal", () => {
  let g = advance(game(), snap({ yards: 4 }), 1);
  assert.equal(g.down, 2);
  assert.equal(g.distance, 6);
  assert.equal(g.spot, 29);
  g = advance(g, snap({ yards: 6 }), 2);
  assert.equal(g.down, 1);
  assert.equal(g.distance, 10);
  g.down = 4;
  g = advance(g, snap({ outcome: "incomplete", yards: 0 }), 3);
  assert.equal(g.possession, 1);
  assert.equal(g.spot, 65);
});
test("touchdown requires conversion before possession change", () => {
  let g = game();
  g.spot = 95;
  g.distance = 5;
  g = advance(g, snap({ yards: 5, td: true, points: 6 }), 1);
  assert.equal(g.score[0], 6);
  assert.equal(g.phase, "conversion");
  assert.equal(g.possession, 0);
  g = advance(
    g,
    snap({ outcome: "extraPoint", points: 1, conversion: true }),
    2,
  );
  assert.equal(g.score[0], 7);
  assert.equal(g.possession, 1);
  assert.equal(g.spot, 25);
});
test("two point conversion, safety, interception and fumble", () => {
  let g = game();
  g.phase = "conversion";
  assert.equal(advance(g, snap({ points: 2, td: true }), 1).score[0], 2);
  g = game();
  g.spot = 3;
  g = advance(
    g,
    snap({ outcome: "sack", yards: -3, safety: true, points: 2 }),
    1,
  );
  assert.equal(g.score[1], 2);
  assert.equal(g.possession, 1);
  for (const outcome of ["interception", "fumble"] as const) {
    g = advance(game(), snap({ outcome, yards: 12 }), 1);
    assert.equal(g.possession, 1);
    assert.equal(g.spot, 63);
  }
});
test("punts, field goals and missed kicks transfer possession", () => {
  let g = advance(game(), snap({ outcome: "punt", yards: 40 }), 1);
  assert.equal(g.spot, 35);
  g = advance(game(), snap({ outcome: "fieldGoal", points: 3, yards: 0 }), 1);
  assert.deepEqual(g.score, [3, 0]);
  assert.equal(g.possession, 1);
  g = game();
  g.spot = 80;
  g = advance(g, snap({ outcome: "missedFieldGoal", yards: 0 }), 1);
  assert.equal(g.spot, 27);
});
test("halftime resets possession; regulation ends; conversion extends period", () => {
  let g = game();
  g.quarter = 2;
  g.clock = 3;
  g = advance(g, snap(), 1);
  assert.equal(g.quarter, 3);
  assert.equal(g.clock, 180);
  assert.equal(g.possession, 1);
  g.quarter = 4;
  g.clock = 1;
  g.score = [7, 0];
  g = advance(g, snap(), 2);
  assert.equal(g.status, "complete");
  assert.equal(g.winner, "a");
  g = game();
  g.quarter = 4;
  g.clock = 1;
  g.spot = 99;
  g = advance(g, snap({ yards: 1, td: true }), 1);
  assert.equal(g.status, "active");
  assert.equal(g.phase, "conversion");
  g = advance(g, snap({ outcome: "extraPoint", points: 1 }), 2);
  assert.equal(g.status, "complete");
});
test("overtime gives both teams a possession before deciding winner", () => {
  let g = game();
  g.quarter = 4;
  g.clock = 1;
  g = advance(g, snap(), 1);
  assert.equal(g.quarter, 5);
  assert.equal(g.spot, 75);
  g = advance(g, snap({ outcome: "fieldGoal", yards: 0, points: 3 }), 2);
  assert.equal(g.status, "active");
  assert.equal(g.otPossessions, 1);
  g = advance(g, snap({ outcome: "interception", yards: 2 }), 3);
  assert.equal(g.status, "complete");
  assert.equal(g.winner, "a");
});
test("complete seeded games finish with valid state and bounded records", () => {
  for (let seed = 1; seed <= 8; seed++) {
    let g = game();
    for (let turn = 0; turn < 250 && g.status === "active"; turn++) {
      const c = call("offense", turn % 2 ? "balanced" : "aggressive");
      c.turn = g.turn;
      c.playId = `offense-${(turn % 5) + 1}`;
      if (g.phase === "conversion") c.action = "extraPoint";
      else if (g.down === 4)
        c.action = g.spot > 60 || g.quarter > 4 ? "fieldGoal" : "punt";
      const d = call("defense");
      d.playId = `defense-${(turn % 5) + 1}`;
      const s = simulate(g, team(), team(), c, d, seed * 10000 + turn);
      assert.ok(JSON.stringify(s).length < 150000);
      g = advance(g, s, turn);
      assert.ok(g.down >= 1 && g.down <= 4);
      assert.ok(g.spot >= 1 && g.spot <= 99);
      assert.ok(g.distance > 0);
      assert.ok(g.score.every((s) => s >= 0));
    }
    assert.equal(g.status, "complete", `seed ${seed} did not end`);
  }
});
test("analytics are additive and do not double-count conversions", () => {
  const a = analytics();
  const s = snap({
    yards: 18,
    target: "WR1",
    read: 1,
    timeToThrow: 1.5,
    pressure: true,
  });
  record(a, s, true);
  record(a, { ...s, conversion: true }, true);
  assert.equal(a.team.calls, 1);
  assert.equal(a.team.yards, 18);
  assert.equal(a.players.WR1.receptions, 1);
  assert.equal(a.players.QB.primary, 1);
  const b = mergeAnalytics(structuredClone(a), a);
  assert.equal(b.team.calls, 2);
});
test("live projection strips play names, IDs, assignments and read index", () => {
  const s = publicSnap(snap());
  for (const key of [
    "offPlayId",
    "defPlayId",
    "offPlayName",
    "defPlayName",
    "coverage",
    "concept",
    "read",
  ])
    assert.ok(!(key in s), key);
  assert.ok(!JSON.stringify(s.reasons).match(/primary|secondary/i));
});
test("interception distance is not credited as offensive yards; caught fumbles are receptions", () => {
  const a = analytics();
  record(
    a,
    snap({ outcome: "interception", yards: 30, target: "WR1", read: 1 }),
    true,
  );
  assert.equal(a.team.yards, 0);
  assert.equal(a.team.success, 0);
  record(
    a,
    snap({ outcome: "fumble", yards: 12, target: "WR1", read: 1 }),
    true,
  );
  assert.equal(a.players.WR1.receptions, 1);
  assert.equal(a.team.completions, 1);
  assert.equal(a.team.turnovers, 2);
});
test("special teams do not reveal unused scrimmage play IDs", () => {
  for (const action of ["punt", "fieldGoal", "extraPoint"] as const) {
    const s = simulate(
      game(),
      team(),
      team(),
      { ...call(), action },
      call("defense"),
      1,
    );
    assert.equal(s.offPlayId, "");
    assert.equal(s.defPlayId, "");
  }
});
