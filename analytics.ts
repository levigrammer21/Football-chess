import { Analytics, Metric, PlayerStat, PlayStat, Snap } from "./model";
export function metric(): Metric {
  return {
    calls: 0,
    yards: 0,
    success: 0,
    attempts: 0,
    completions: 0,
    td: 0,
    int: 0,
    sacks: 0,
    pressure: 0,
    explosive: 0,
    primaryTargets: 0,
    secondaryTargets: 0,
    primarySuccess: 0,
    secondarySuccess: 0,
    throwTime: 0,
    throws: 0,
    turnovers: 0,
  };
}
export function analytics(): Analytics {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    plays: {},
    players: {},
    team: metric(),
  };
}
function player(): PlayerStat {
  return {
    snaps: 0,
    attempts: 0,
    completions: 0,
    yards: 0,
    td: 0,
    int: 0,
    sacks: 0,
    pressures: 0,
    targets: 0,
    receptions: 0,
    drops: 0,
    separation: 0,
    contested: 0,
    tackles: 0,
    missedTackles: 0,
    breakups: 0,
    primary: 0,
    secondary: 0,
    decisionTime: 0,
  };
}
const caught = (s: Snap) =>
  s.outcome === "complete" || (s.outcome === "fumble" && s.target !== null);
const attempt = (s: Snap) => s.target !== null || s.outcome === "incomplete";
const yards = (s: Snap) => (s.outcome === "interception" ? 0 : s.yards);
export function addMetric(m: Metric, s: Snap) {
  const gain = yards(s),
    complete = caught(s);
  m.calls++;
  m.yards += gain;
  m.success += Number(
    !["interception", "fumble"].includes(s.outcome) &&
      (s.td ||
        gain >=
          (s.down === 1
            ? s.distance * 0.4
            : s.down === 2
              ? s.distance * 0.6
              : s.distance)),
  );
  m.attempts += Number(attempt(s));
  m.completions += Number(complete);
  m.td += Number(s.td);
  m.int += Number(s.outcome === "interception");
  m.sacks += Number(s.outcome === "sack");
  m.pressure += Number(s.pressure);
  m.explosive += Number(gain >= 20);
  m.primaryTargets += Number(s.read === 1);
  m.secondaryTargets += Number(s.read === 2);
  m.primarySuccess += Number(s.read === 1 && complete);
  m.secondarySuccess += Number(s.read === 2 && complete);
  m.throwTime += s.timeToThrow;
  m.throws += Number(s.target !== null);
  m.turnovers += Number(["interception", "fumble"].includes(s.outcome));
}
export function record(a: Analytics, s: Snap, onOffense: boolean) {
  if (
    s.conversion ||
    [
      "punt",
      "fieldGoal",
      "missedFieldGoal",
      "extraPoint",
      "missedExtraPoint",
    ].includes(s.outcome)
  )
    return;
  const id = onOffense ? s.offPlayId : s.defPlayId;
  const name = onOffense ? s.offPlayName : s.defPlayName;
  const key = `${id}::${name}`;
  const p: PlayStat = (a.plays[key] ??= {
    name,
    side: onOffense ? "offense" : "defense",
    total: metric(),
    splits: {},
  });
  addMetric(p.total, s);
  if (onOffense) addMetric(a.team, s);
  const band =
    s.distance <= 3
      ? "Short (1–3)"
      : s.distance <= 7
        ? "Medium (4–7)"
        : "Long (8+)";
  for (const split of [
    `Down ${s.down}`,
    band,
    `Down ${s.down} · ${band}`,
    onOffense ? `vs ${s.coverage}` : `vs ${s.concept}`,
  ])
    addMetric((p.splits[split] ??= metric()), s);
  const at = (id: string) => (a.players[id] ??= player());
  const complete = caught(s);
  if (onOffense) {
    const q = at("QB");
    q.snaps++;
    q.pressures += Number(s.pressure);
    q.sacks += Number(s.outcome === "sack");
    q.attempts += Number(attempt(s));
    q.completions += Number(complete);
    q.yards += complete ? s.yards : 0;
    q.td += Number(s.td && complete);
    q.int += Number(s.outcome === "interception");
    q.primary += Number(s.read === 1 && complete);
    q.secondary += Number(s.read === 2 && complete);
    q.decisionTime += s.timeToThrow;
    q.targets += Number(s.target !== null);
    if (s.target) {
      const r = at(s.target);
      r.snaps++;
      r.targets++;
      r.receptions += Number(complete);
      r.yards += complete ? s.yards : 0;
      r.td += Number(s.td && complete);
      r.drops += Number(s.drop);
      r.separation += s.separation;
      r.contested += Number(s.contested && complete);
    }
    if (
      s.outcome === "run" ||
      s.outcome === "scramble" ||
      (s.outcome === "fumble" && !s.target)
    ) {
      const r = at(s.outcome === "scramble" ? "QB" : "RB");
      r.yards += s.yards;
      r.td += Number(s.td);
    }
  } else {
    if (s.coverageDefender && s.target) {
      const c = at(s.coverageDefender);
      c.targets++;
      c.completions += Number(complete);
      c.yards += complete ? s.yards : 0;
      c.breakups += Number(
        s.outcome === "incomplete" &&
          !s.drop &&
          s.defender === s.coverageDefender,
      );
    }
    if (s.defender) {
      const d = at(s.defender);
      d.snaps++;
      d.int += Number(s.outcome === "interception");
      d.sacks += Number(s.outcome === "sack");
      d.tackles += Number(
        ["complete", "run", "scramble", "sack", "fumble"].includes(s.outcome) &&
          !s.td,
      );
    }
    for (const id of s.pressurers) at(id).pressures++;
    for (const id of s.missedTackles) at(id).missedTackles++;
  }
}
export function mergeAnalytics(a: Analytics, b: Analytics): Analytics {
  const merge = (x: any, y: any): any => {
    for (const [k, v] of Object.entries(y)) {
      if (typeof v === "number")
        x[k] = (typeof x[k] === "number" ? x[k] : 0) + v;
      else if (v && typeof v === "object") x[k] = merge(x[k] ?? {}, v);
      else x[k] = v;
    }
    return x;
  };
  return merge(a, b);
}
export const pct = (a: number, b: number) =>
  b ? `${Math.round((a / b) * 100)}%` : "—";
export const avg = (a: number, b: number) => (b ? (a / b).toFixed(1) : "—");
