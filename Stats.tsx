import { useState } from "react";
import { Analytics, Metric, PlayStat, PlayerStat } from "./model";
import { avg, pct } from "./analytics";
export function Tiles({ items }: { items: [string, string | number][] }) {
  return (
    <div className="stats-grid">
      {items.map(([k, v]) => (
        <div className="stat" key={k}>
          <strong>{v}</strong>
          <span>{k}</span>
        </div>
      ))}
    </div>
  );
}
export function MetricView({
  m,
  defense = false,
}: {
  m: Metric;
  defense?: boolean;
}) {
  return (
    <Tiles
      items={[
        ["Calls", m.calls],
        [defense ? "Yards allowed" : "Yards", m.yards],
        ["Yards / play", avg(m.yards, m.calls)],
        ["Success rate", pct(m.success, m.calls)],
        [
          defense ? "Completion allowed" : "Completion",
          pct(m.completions, m.attempts),
        ],
        ["Touchdowns", m.td],
        ["Interceptions", m.int],
        ["Sack rate", pct(m.sacks, m.calls)],
        ["Pressure rate", pct(m.pressure, m.calls)],
        ["Explosive plays", m.explosive],
        ["Turnovers", m.turnovers],
        ["Avg throw time", `${avg(m.throwTime, m.throws)}s`],
        ...(!defense
          ? ([
              ["Primary target rate", pct(m.primaryTargets, m.throws)],
              ["Secondary target rate", pct(m.secondaryTargets, m.throws)],
              ["Primary completion", pct(m.primarySuccess, m.primaryTargets)],
              [
                "Secondary completion",
                pct(m.secondarySuccess, m.secondaryTargets),
              ],
            ] as [string, string][])
          : []),
      ]}
    />
  );
}
export function PlayStats({ p }: { p: PlayStat }) {
  return (
    <div className="card">
      <h3>{p.name}</h3>
      <p className="eyebrow">{p.side}</p>
      <MetricView m={p.total} defense={p.side === "defense"} />
      <h3>Matchups & situations</h3>
      {Object.entries(p.splits).map(([key, m]) => (
        <div className="split" key={key}>
          <strong>{key}</strong>
          <span>
            {m.calls} calls · {avg(m.yards, m.calls)} yd/play ·{" "}
            {pct(m.success, m.calls)} success
          </span>
        </div>
      ))}
    </div>
  );
}
function PlayerDetail({ id, p }: { id: string; p: PlayerStat }) {
  const offense = ["QB", "WR1", "WR2", "WR3", "TE", "RB"].includes(id);
  const qb = id === "QB";
  return (
    <details className="card">
      <summary>
        {id}
        <span>
          {qb
            ? `${p.completions}/${p.attempts} · ${p.yards} yd`
            : offense
              ? `${p.receptions} catches · ${p.yards} yd`
              : `${p.tackles} tackles · ${p.sacks} sacks`}
        </span>
      </summary>
      <Tiles
        items={
          qb
            ? [
                ["Attempts", p.attempts],
                ["Completions", p.completions],
                ["Yards", p.yards],
                ["TD", p.td],
                ["INT", p.int],
                ["Sacks", p.sacks],
                ["Pressure rate", pct(p.pressures, p.snaps)],
                ["Primary completions", p.primary],
                ["Secondary completions", p.secondary],
                ["Avg throw decision", `${avg(p.decisionTime, p.targets)}s`],
              ]
            : offense
              ? [
                  ["Targets", p.targets],
                  ["Receptions", p.receptions],
                  ["Yards", p.yards],
                  ["TD", p.td],
                  ["Drops", p.drops],
                  ["Avg separation", `${avg(p.separation, p.targets)} yd`],
                  ["Contested catches", p.contested],
                ]
              : [
                  ["Targets credited", p.targets],
                  ["Completions allowed", p.completions],
                  ["INT", p.int],
                  ["Breakups", p.breakups],
                  ["Tackles", p.tackles],
                  ["Missed tackles", p.missedTackles],
                  ["Pressures", p.pressures],
                  ["Sacks", p.sacks],
                ]
        }
      />
    </details>
  );
}
export function AnalyticsView({
  data,
  initialPlay,
}: {
  data: Analytics;
  initialPlay?: string;
}) {
  const [tab, setTab] = useState("offense");
  const [selected, setSelected] = useState(initialPlay || "");
  const selectedPlay = Object.entries(data.plays).find(
    ([key, p]) => key === selected || key.startsWith(selected + "::"),
  );
  return (
    <section>
      <p className="eyebrow">Film-backed performance</p>
      <h2>Analytics</h2>
      <Tiles
        items={[
          ["Games", data.games],
          ["Wins", data.wins],
          ["Losses", data.losses],
          ["Ties", data.ties],
        ]}
      />
      <div className="tabs">
        {["offense", "defense", "players", "team"].map((t) => (
          <button
            className={tab === t ? "selected" : ""}
            onClick={() => {
              setTab(t);
              setSelected("");
            }}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      {selected && selectedPlay ? (
        <>
          <button onClick={() => setSelected("")}>← All plays</button>
          <PlayStats p={selectedPlay[1]} />
        </>
      ) : tab === "team" ? (
        <MetricView m={data.team} />
      ) : tab === "players" ? (
        Object.entries(data.players).length ? (
          Object.entries(data.players).map(([id, p]) => (
            <PlayerDetail key={id} id={id} p={p} />
          ))
        ) : (
          <p className="empty">
            Player performance appears after a completed game.
          </p>
        )
      ) : (
        <>
          {Object.entries(data.plays)
            .filter(([, p]) => p.side === tab)
            .map(([key, p]) => (
              <button
                className="list-card"
                onClick={() => setSelected(key)}
                key={key}
              >
                <div>
                  <strong>{p.name}</strong>
                  <span>
                    {p.total.calls} calls ·{" "}
                    {pct(p.total.success, p.total.calls)} success
                  </span>
                </div>
                <b>
                  {avg(p.total.yards, p.total.calls)}
                  <small>yd / play</small>
                </b>
              </button>
            ))}
          {!Object.values(data.plays).some((p) => p.side === tab) && (
            <p className="empty">
              Complete a game to build your {tab} analytics.
            </p>
          )}
        </>
      )}
      <p className="muted">
        Success: 40% of needed yards on first down, 60% on second, a first down
        on third/fourth. Explosive: 20+ yards. Conversions and kicks are
        excluded from scrimmage analytics. Defender coverage credit goes to the
        closest involved defender.
      </p>
    </section>
  );
}
