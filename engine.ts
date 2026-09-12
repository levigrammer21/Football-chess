import {
  Athlete,
  Call,
  Frame,
  Game,
  GamePlan,
  Point,
  Receiver,
  Snap,
  starts,
  eligible,
  defensePositions,
  offensePositions,
} from "./model";
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function move(a: Point, b: Point, step: number): Point {
  const d = distance(a, b);
  return d <= step
    ? { ...b }
    : { x: a.x + ((b.x - a.x) * step) / d, y: a.y + ((b.y - a.y) * step) / d };
}
export function routePosition(route: Point[], travel: number): Point {
  for (let i = 1; i < route.length; i++) {
    const d = distance(route[i - 1], route[i]);
    if (travel <= d) return move(route[i - 1], route[i], travel);
    travel -= d;
  }
  return { ...route[route.length - 1] };
}
function laneDistance(p: Point, a: Point, b: Point) {
  const len = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const u = clamp(
    ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len || 1),
    0,
    1,
  );
  return {
    distance: distance(p, {
      x: a.x + u * (b.x - a.x),
      y: a.y + u * (b.y - a.y),
    }),
    u,
  };
}
export function simulate(
  g: Game,
  off: GamePlan,
  def: GamePlan,
  call: Call,
  defCall: Call,
  seed: number,
): Snap {
  const rng = random(seed);
  const op = off.plays.find(
    (p) => p.id === call.playId && p.side === "offense",
  );
  const dp = def.plays.find(
    (p) => p.id === defCall.playId && p.side === "defense",
  );
  if (!op || !dp) throw new Error("Play not in locked plan");
  const O = Object.fromEntries(off.roster.map((p) => [p.position, p]));
  const D = Object.fromEntries(def.roster.map((p) => [p.position, p]));
  const qb = O.QB.ratings;
  const coverage = Object.values(dp.assignments).some((a) => a.kind === "blitz")
    ? "blitz"
    : Object.values(dp.assignments).filter((a) => a.kind === "man").length >= 4
      ? "man"
      : "zone";
  const s: Snap = {
    turn: g.turn,
    offense: g.possession,
    quarter: g.quarter,
    clock: g.clock,
    down: g.down,
    distance: g.distance,
    spot: g.spot,
    drive: g.drive,
    outcome: "incomplete",
    yards: 0,
    td: false,
    safety: false,
    conversion: g.phase === "conversion",
    points: 0,
    target: null,
    read: 0,
    timeToThrow: 0,
    pressure: false,
    separation: 0,
    contested: false,
    drop: false,
    coverageDefender: null,
    defender: null,
    missedTackles: [],
    pressurers: [],
    frames: [],
    reasons: [],
    duration: 6,
    coverage,
    concept: op.concept,
    offPlayId: op.id,
    defPlayId: dp.id,
    offPlayName: op.name,
    defPlayName: dp.name,
  };
  const pos: Record<string, Point> = {};
  offensePositions.forEach((p) => (pos[`O:${p}`] = { ...starts[p] }));
  defensePositions.forEach((p) => (pos[`D:${p}`] = { ...starts[p] }));
  let ball = { ...starts.QB };
  const frame = (t: number, event = "") =>
    s.frames.push({
      t: Math.round(t * 100) / 100,
      players: Object.fromEntries(
        Object.entries(pos).map(([k, p]) => [
          k,
          { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 },
        ]),
      ),
      ball: { ...ball },
      event,
    });
  frame(0, "Snap");
  if (["punt", "fieldGoal", "extraPoint"].includes(call.action)) {
    s.offPlayId = "";
    s.defPlayId = "";
    s.offPlayName = call.action === "punt" ? "Punt unit" : "Kicking unit";
    s.defPlayName = "Special teams";
    s.coverage = "special teams";
    s.concept = "special teams";
    const skill = O.K.ratings.kicking;
    const range = call.action === "extraPoint" ? 33 : 117 - g.spot;
    if (call.action === "punt") {
      s.outcome = "punt";
      s.yards = Math.min(
        100 - g.spot,
        Math.round(32 + skill * 0.12 + rng() * 12),
      );
      s.reasons = ["Punt sends possession downfield."];
    } else {
      const good =
        rng() <
        clamp(0.98 - (range - 25) * 0.014 + (skill - 75) * 0.005, 0.08, 0.99);
      s.outcome =
        call.action === "extraPoint"
          ? good
            ? "extraPoint"
            : "missedExtraPoint"
          : good
            ? "fieldGoal"
            : "missedFieldGoal";
      s.points = good ? (call.action === "extraPoint" ? 1 : 3) : 0;
      s.reasons = [
        good
          ? `Kick good from ${range} yards.`
          : `Kick missed from ${range} yards.`,
      ];
    }
    for (let t = 1; t <= 12; t++) {
      ball = {
        x: 26.5,
        y:
          -5 +
          (t / 12) * (call.action === "punt" ? s.yards : 100 - g.spot + 10),
      };
      frame(t * 0.3, t === 12 ? s.reasons[0] : "Kick");
    }
    s.duration = 7;
    return s;
  }
  const mentality = {
    conservative: { window: 3.6, hold: 3.7, progress: 0.65, risk: 0.03 },
    balanced: { window: 2.5, hold: 4.8, progress: 1, risk: 0.13 },
    aggressive: { window: 1.6, hold: 6.2, progress: 1.4, risk: 0.36 },
  }[call.mentality];
  const travel: Record<string, number> = {};
  eligible.forEach((p) => (travel[p] = 0));
  const rushers = defensePositions.filter((p) =>
    ["rush", "blitz"].includes(dp.assignments[p].kind),
  );
  const progressTime =
    clamp(1.35 - (qb.awareness + qb.decision - 140) * 0.012, 0.65, 1.8) *
    mentality.progress;
  let carrier: string | null = op.kind === "run" ? "RB" : null;
  let throwAt = 0;
  let arriveAt = 0;
  let aim: Point | null = null;
  let releaseBall: Point | null = null;
  let caught = false;
  let finished = false;
  let target: Receiver | null = null;
  let lastRead = 0;
  let timer = 0;
  const checkedTackle: Record<string, number> = {};
  if (carrier) {
    s.outcome = "run";
    s.reasons.push("Designed handoff to RB; blockers engage the front.");
  }
  const nearest = (p: Point) =>
    defensePositions
      .map((id) => ({ id, d: distance(p, pos[`D:${id}`]) }))
      .sort((a, b) => a.d - b.d);
  const speed = (a: Athlete, t: number) =>
    (3.7 + a.ratings.speed * 0.052) *
    Math.min(1, 0.28 + t * (0.55 + a.ratings.acceleration * 0.007));
  for (let step = 1; step <= 100 && !finished; step++) {
    const t = step * 0.12;
    timer = t;
    for (const p of eligible) {
      const a = O[p];
      const path = [starts[p], ...op.routes[p].slice(1)];
      const release = clamp((90 - a.ratings.release) * 0.01, 0, 0.45);
      travel[p] +=
        t > release
          ? speed(a, t) * 0.12 * (0.75 + a.ratings.route * 0.0025)
          : 0;
      pos[`O:${p}`] = routePosition(path, travel[p]);
    }
    if (carrier === "QB")
      pos["O:QB"] = move(
        pos["O:QB"],
        {
          x: pos["O:QB"].x + (pos["O:QB"].x < 26 ? -0.9 : 0.9),
          y: 100 - g.spot + 1,
        },
        speed(O.QB, t) * 0.12 * (0.7 + qb.mobility * 0.004),
      );
    if (carrier && caught) {
      const a = O[carrier];
      const cur = pos[`O:${carrier}`]; // Continue forward after route's receiving point, not along an unfinished route.
      const prior =
        s.frames[s.frames.length - 1]?.players[`O:${carrier}`] || cur;
      const obstacle = nearest(prior)[0];
      const dx =
        obstacle.d < 5
          ? (prior.x - pos[`D:${obstacle.id}`].x) *
            (0.1 + a.ratings.vision * 0.003)
          : 0;
      pos[`O:${carrier}`] = move(
        prior,
        { x: clamp(prior.x + dx, 1, 52), y: 101 - g.spot },
        speed(a, t) * 0.12,
      );
    }
    for (const p of ["LT", "LG", "C", "RG", "RT"]) {
      const initial = starts[p];
      const candidates = rushers
        .map((d) => ({ d, dist: distance(initial, pos[`D:${d}`]) }))
        .sort((a, b) => a.dist - b.dist);
      if (candidates.length) {
        const dest = pos[`D:${candidates[0].d}`];
        pos[`O:${p}`] = move(
          pos[`O:${p}`],
          {
            x: clamp(dest.x, initial.x - 3, initial.x + 3),
            y: clamp(dest.y, -2, op.kind === "run" ? 6 : 1),
          },
          0.32,
        );
      }
    }
    for (const p of defensePositions) {
      const a = dp.assignments[p],
        r = D[p].ratings,
        cur = pos[`D:${p}`];
      let dest: Point = { ...a.center };
      let pace = speed(D[p], t);
      if (carrier && (caught || op.kind === "run" || carrier === "QB")) {
        const c = pos[`O:${carrier}`];
        const delay = clamp((100 - r.recognition) * 0.012, 0, 0.65);
        dest =
          t > delay
            ? { x: c.x, y: c.y + 0.25 + (r.pursuit - 70) * 0.016 }
            : cur;
      } else if (a.kind === "man") {
        const rec = pos[`O:${a.target}`];
        const releaseEdge = (O[a.target].ratings.release - r.man) * 0.009;
        const lag = clamp(
          0.3 +
            (O[a.target].ratings.route - r.man) * 0.025 +
            (100 - r.reaction) * 0.008 +
            releaseEdge,
          0.12,
          1.6,
        );
        dest = { x: rec.x, y: rec.y - lag };
        pace *= clamp(
          1 + (r.man - O[a.target].ratings.route) * 0.004,
          0.8,
          1.12,
        );
      } else if (a.kind === "zone") {
        const threats = eligible
          .map((id) => ({ id, d: distance(pos[`O:${id}`], a.center) }))
          .filter((x) => x.d < a.radius + 2)
          .sort((a, b) => a.d - b.d);
        if (threats.length) {
          const rec = pos[`O:${threats[0].id}`];
          dest = move(a.center, rec, a.radius * (0.55 + r.zone * 0.004));
        }
        pace *= 0.7 + r.zone * 0.003;
      } else if (a.kind === "spy") {
        dest = { x: pos["O:QB"].x, y: Math.max(2, pos["O:QB"].y + 6) };
        pace *= 0.8;
      } else if (a.kind === "contain") {
        dest = { x: p === "LB2" || starts[p].x > 26 ? 35 : 18, y: -3 };
      } else {
        dest = pos["O:QB"];
        const blockers = [
          "LT",
          "LG",
          "C",
          "RG",
          "RT",
          ...(s.target === "RB" ? [] : ["RB"]),
        ]
          .filter((b) => b !== "RB" || (op.kind !== "run" && t < 0.8))
          .map((b) => ({ b, d: distance(cur, pos[`O:${b}`]) }))
          .sort((a, b) => a.d - b.d);
        const b = blockers[0];
        if (b && b.d < 3) {
          const br = O[b.b].ratings;
          const rushSkill = r.rush * 0.5 + r.shedding * 0.3 + r.strength * 0.2;
          const blockSkill = br.blocking * 0.7 + br.strength * 0.3;
          pace *= clamp(
            0.11 + (rushSkill - blockSkill) * 0.014 + t * 0.026,
            0.06,
            0.68,
          );
        } else if (t < 0.4) pace *= 0.2;
      }
      if (carrier) {
        const blockers = [
          "LT",
          "LG",
          "C",
          "RG",
          "RT",
          ...(carrier === "RB" ? ["TE"] : []),
        ]
          .map((b) => ({ b, d: distance(cur, pos[`O:${b}`]) }))
          .filter((b) => b.d < 2.5)
          .sort((a, b) => a.d - b.d);
        if (blockers.length) {
          const br = O[blockers[0].b].ratings;
          pace *= clamp(0.18 + (r.shedding - br.blocking) * 0.011, 0.08, 0.8);
        }
      }
      if (
        throwAt &&
        t > throwAt + (100 - r.reaction) * 0.009 &&
        aim &&
        !carrier &&
        distance(cur, aim) < a.radius + 3
      )
        dest = aim;
      pos[`D:${p}`] = move(cur, dest, pace * 0.12);
    }
    if (carrier) {
      ball = { ...pos[`O:${carrier}`] };
      s.yards = Math.round(ball.y);
      if (g.spot + ball.y >= 100) {
        s.td = true;
        finished = true;
        s.reasons.push("Ball carrier reaches the end zone.");
      } else if (ball.x <= 0.5 || ball.x >= 52.8) {
        finished = true;
        s.reasons.push("Ball carrier steps out.");
      } else
        for (const p of nearest(ball).filter((x) => x.d < 1.25)) {
          if ((checkedTackle[p.id] || 0) > t) continue;
          checkedTackle[p.id] = t + 1.1;
          const tackle = D[p.id].ratings.tackling;
          const evade = O[carrier].ratings.elusiveness;
          if (rng() < clamp(0.72 + (tackle - evade) * 0.008, 0.3, 0.95)) {
            s.defender = p.id;
            finished = true;
            if (
              rng() <
              clamp(
                0.013 + (tackle - O[carrier].ratings.strength) * 0.0007,
                0.004,
                0.04,
              )
            ) {
              s.outcome = "fumble";
              s.reasons.push(`${p.id} strips the ball; defense recovers.`);
            } else s.reasons.push(`${p.id} makes the tackle.`);
            break;
          } else if (!s.missedTackles.includes(p.id))
            s.missedTackles.push(p.id);
        }
      if (!finished && t > 10) {
        finished = true;
        s.reasons.push("Pursuit closes the play.");
      }
    } else if (throwAt && aim && releaseBall) {
      const ratio = clamp((t - throwAt) / (arriveAt - throwAt), 0, 1);
      ball = {
        x: releaseBall.x + (aim.x - releaseBall.x) * ratio,
        y: releaseBall.y + (aim.y - releaseBall.y) * ratio,
      };
      if (t >= arriveAt) {
        const defenders = nearest(aim);
        const danger = defenders[0];
        s.coverageDefender = danger.id;
        s.separation =
          Math.round(
            distance(pos[`O:${target!}`], pos[`D:${danger.id}`]) * 100,
          ) / 100;
        s.contested = danger.d < 2;
        const accurate = distance(aim, pos[`O:${target!}`]) < 2.4;
        const hands =
          target === "RB" ? O.RB.ratings.receiving : O[target!].ratings.hands;
        if (
          danger.d < 1.8 &&
          rng() <
            clamp(
              0.14 +
                (D[danger.id].ratings.ball - 65) * 0.012 +
                (accurate ? 0 : 0.18),
              0.08,
              0.65,
            )
        ) {
          s.outcome = "interception";
          s.defender = danger.id;
          s.yards = Math.round(aim.y);
          finished = true;
          s.reasons.push(
            `${danger.id} closes the throwing lane and intercepts.`,
          );
        } else if (
          accurate &&
          rng() <
            clamp(
              0.58 +
                hands * 0.0045 -
                (s.contested ? (100 - O[target!].ratings.traffic) * 0.009 : 0),
              0.25,
              0.98,
            )
        ) {
          s.outcome = "complete";
          carrier = target;
          caught = true;
          pos[`O:${target!}`] = { ...aim };
          s.yards = Math.round(aim.y);
          s.defender = danger.id;
          s.reasons.push(
            s.contested
              ? "Receiver wins the contested catch."
              : "Receiver secures the pass in space.",
          );
          if (g.spot + aim.y >= 100) {
            s.td = true;
            finished = true;
          }
        } else {
          s.outcome = "incomplete";
          s.drop = accurate && danger.d >= 1.5;
          s.defender = danger.d < 2 ? danger.id : null;
          finished = true;
          s.yards = 0;
          s.reasons.push(
            !accurate
              ? s.pressure
                ? "Pressure disrupts accuracy."
                : "Pass misses the moving receiver."
              : s.drop
                ? "Receiver drops the pass."
                : `${danger.id} breaks up the contested pass.`,
          );
        }
      }
    } else {
      const threats = rushers
        .map((p) => ({ id: p, d: distance(pos[`D:${p}`], pos["O:QB"]) }))
        .sort((a, b) => a.d - b.d);
      const pressure = threats.filter((x) => x.d < 3.4);
      if (pressure.length) {
        s.pressure = true;
        pressure.forEach((x) => {
          if (!s.pressurers.includes(x.id)) s.pressurers.push(x.id);
        });
      }
      if (threats[0]?.d < 0.95) {
        s.outcome = "sack";
        s.yards = Math.round(pos["O:QB"].y);
        s.defender = threats[0].id;
        s.reasons.push(
          `${threats[0].id} beats the block before the QB releases.`,
        );
        finished = true;
      } else if (
        t >
        { conservative: 0.4, balanced: 0.65, aggressive: 1.05 }[
          call.mentality
        ] +
          (100 - qb.decision) * 0.008
      ) {
        const read = t < progressTime + 0.65 ? 1 : 2;
        const candidate = op.reads[read - 1];
        if (read !== lastRead) {
          s.reasons.push(
            read === 1
              ? "QB evaluates the primary read."
              : "QB progresses to the secondary read.",
          );
          lastRead = read;
        }
        const cp = pos[`O:${candidate}`];
        const defenders = nearest(cp);
        const sep = defenders[0].d;
        const throwDistance = distance(pos["O:QB"], cp);
        const help = defenders.filter(
          (d) => d.d < 5 && d.id !== defenders[0].id,
        ).length;
        const lane = defensePositions.filter((d) => {
          const l = laneDistance(pos[`D:${d}`], pos["O:QB"], cp);
          return l.u > 0.2 && l.u < 0.95 && l.distance < 1.4;
        }).length;
        const quality =
          sep -
          help * 0.85 -
          lane * 0.8 -
          (throwDistance > qb.arm * 0.65 ? 2 : 0) +
          (qb.awareness - 75) * 0.025 +
          (O[candidate].ratings.route - D[defenders[0].id].ratings.coverage) *
            0.008;
        const desperate = t > mentality.hold - 0.4 && rng() < mentality.risk;
        const viable =
          quality >
          mentality.window + (s.pressure ? (100 - qb.pressure) * 0.014 : 0);
        if (viable || desperate) {
          target = candidate;
          s.target = target;
          s.read = read;
          s.timeToThrow = t;
          throwAt = t;
          releaseBall = { ...pos["O:QB"] };
          const flight = throwDistance / (18 + qb.arm * 0.16) + 0.08;
          arriveAt = t + flight;
          const projected = routePosition(
            [starts[target], ...op.routes[target].slice(1)],
            travel[target] +
              speed(O[target], t) *
                flight *
                (0.75 + O[target].ratings.route * 0.0025),
          );
          const error = clamp(
            (100 - qb.accuracy) * 0.035 +
              throwDistance * 0.018 +
              (s.pressure ? (100 - qb.pressure) * 0.045 : 0),
            0.3,
            5,
          );
          aim = {
            x: clamp(projected.x + (rng() - 0.5) * error * 3, 0, 53.3),
            y: projected.y + (rng() - 0.5) * error * 3,
          };
          s.separation = sep;
          s.reasons.push(
            desperate
              ? "QB forces a tight-window throw."
              : help === 0 && sep > 4
                ? "Route geometry creates an open throwing window."
                : "QB finds a viable window.",
          );
        } else if (t >= mentality.hold || (pressure.length && t > 1.3)) {
          if (
            qb.mobility > 70 &&
            rng() < 0.25 + (qb.mobility - 70) * 0.014 &&
            call.mentality !== "conservative"
          ) {
            carrier = "QB";
            s.outcome = "scramble";
            s.reasons.push("Both reads are covered; QB escapes on the ground.");
          } else {
            s.outcome = "incomplete";
            s.reasons.push(
              help
                ? "Safety help closes the read; QB throws away."
                : "No viable read; QB throws safely out of bounds.",
            );
            finished = true;
          }
        }
      }
      ball = { ...pos["O:QB"] };
    }
    frame(
      t,
      finished
        ? s.outcome
        : throwAt && !carrier
          ? "Pass in flight"
          : carrier
            ? "Ball carrier"
            : "",
    );
  }
  if (!finished && s.outcome === "incomplete")
    s.reasons.push("Coverage outlasts the pocket; pass falls incomplete.");
  s.yards = clamp(s.yards, -g.spot, 100 - g.spot);
  s.td =
    s.td &&
    !["interception", "fumble", "incomplete", "sack"].includes(s.outcome);
  s.safety =
    !s.td &&
    g.spot + s.yards <= 0 &&
    !["incomplete", "interception", "fumble"].includes(s.outcome);
  s.points = s.td ? (s.conversion ? 2 : 6) : s.safety ? 2 : 0;
  s.duration =
    Math.round(timer) +
    (["incomplete", "interception", "fumble"].includes(s.outcome) || s.td
      ? 3
      : 22);
  return s;
}
export function newGame(
  id: string,
  uid: string,
  name: string,
  now: number,
): Game {
  return {
    id,
    members: [uid],
    names: [name],
    status: "waiting",
    score: [0, 0],
    possession: 0,
    quarter: 1,
    clock: 180,
    down: 1,
    distance: 10,
    spot: 25,
    drive: 1,
    turn: 0,
    phase: "scrimmage",
    locks: [],
    deadline: now + 86400000,
    createdAt: now,
    endedAt: 0,
    winner: null,
    lastSummary: "Waiting for an opponent",
    otPossessions: 0,
    misses: [0, 0],
  };
}
export function finish(g: Game, now: number, winner?: string) {
  g.status = "complete";
  g.endedAt = now;
  g.winner =
    winner ??
    (g.score[0] === g.score[1]
      ? null
      : g.members[g.score[0] > g.score[1] ? 0 : 1]);
  g.locks = [];
}
export function advance(before: Game, s: Snap, now: number): Game {
  const g = structuredClone(before);
  const old = g.possession;
  let changed = false;
  const switchPossession = (spot = 25) => {
    changed = true;
    g.possession = 1 - old;
    g.spot = clamp(spot, 1, 99);
    g.down = 1;
    g.distance = Math.min(10, 100 - g.spot);
    g.phase = "scrimmage";
    g.drive++;
    if (g.quarter > 4) {
      g.otPossessions++;
      g.spot = 75;
      g.distance = 10;
    }
  };
  if (g.phase === "conversion") {
    g.score[old] += s.points;
    switchPossession();
  } else if (s.td) {
    g.score[old] += 6;
    g.phase = "conversion";
    g.spot = 98;
    g.distance = 2;
    g.down = 1;
  } else if (s.safety) {
    g.score[1 - old] += 2;
    switchPossession(35);
  } else if (s.outcome === "fieldGoal") {
    g.score[old] += 3;
    switchPossession();
  } else if (s.outcome === "missedFieldGoal")
    switchPossession(Math.max(20, 100 - g.spot + 7));
  else if (s.outcome === "punt")
    switchPossession(g.spot + s.yards >= 100 ? 20 : 100 - g.spot - s.yards);
  else if (["interception", "fumble"].includes(s.outcome))
    switchPossession(g.spot + s.yards >= 100 ? 20 : 100 - g.spot - s.yards);
  else {
    g.spot = clamp(g.spot + s.yards, 1, 99);
    if (s.yards >= g.distance) {
      g.down = 1;
      g.distance = Math.min(10, 100 - g.spot);
    } else {
      g.down++;
      g.distance -= s.yards;
      if (g.down > 4) switchPossession(100 - g.spot);
    }
  }
  if (before.quarter <= 4 && before.phase !== "conversion")
    g.clock = Math.max(0, g.clock - s.duration);
  if (
    g.quarter > 4 &&
    changed &&
    g.otPossessions % 2 === 0 &&
    g.score[0] !== g.score[1]
  )
    finish(g, now);
  if (g.quarter <= 4 && g.clock === 0 && g.phase !== "conversion") {
    if (g.quarter === 4) {
      if (g.score[0] !== g.score[1]) finish(g, now);
      else {
        g.quarter = 5;
        g.clock = 0;
        g.possession = 0;
        g.spot = 75;
        g.down = 1;
        g.distance = 10;
        g.drive++;
      }
    } else {
      g.quarter++;
      g.clock = 180;
      if (g.quarter === 3) {
        g.possession = 1;
        g.spot = 25;
        g.down = 1;
        g.distance = 10;
        g.drive++;
      }
    }
  }
  g.turn++;
  g.locks = [];
  g.deadline = now + 120000;
  g.lastSummary = `${s.outcome.replaceAll(/([A-Z])/g, " $1")} · ${s.yards} yd${s.td ? " · TOUCHDOWN" : ""}`;
  return g;
}
export function publicSnap(s: Snap) {
  const {
    coverage,
    concept,
    offPlayId,
    defPlayId,
    offPlayName,
    defPlayName,
    read,
    ...safe
  } = s;
  return {
    ...safe,
    reasons: safe.reasons.map((r) =>
      r.replace(/primary read|secondary read/g, "receiving option"),
    ),
  };
}
