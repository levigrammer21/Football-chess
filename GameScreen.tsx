import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "./sync";
import { Services } from "./firebase-client";
import {
  Analytics,
  Call,
  Game,
  GamePlan,
  Mentality,
  Play,
  Snap,
  SnapPublic,
} from "./model";
import { Replay, Field } from "./Field";
import { AnalyticsView, Tiles } from "./Stats";
import { avg, pct } from "./analytics";
export function clockText(g: { quarter: number; clock: number }) {
  return g.quarter > 4
    ? "OT"
    : `Q${g.quarter} · ${Math.floor(g.clock / 60)}:${String(g.clock % 60).padStart(2, "0")}`;
}
export function GameScreen({
  api,
  id,
  uid,
  onBack,
}: {
  api: Services;
  id: string;
  uid: string;
  onBack: () => void;
}) {
  const [g, setGame] = useState<Game | null>(null),
    [plan, setPlan] = useState<GamePlan | null>(null),
    [snaps, setSnaps] = useState<SnapPublic[]>([]),
    [film, setFilm] = useState<
      (Snap & { offPlay: Play | null; defPlay: Play | null })[]
    >([]),
    [reports, setReports] = useState<Record<string, Analytics>>({}),
    [index, setIndex] = useState(-1),
    [playId, setPlayId] = useState(""),
    [mentality, setMentality] = useState<Mentality>("balanced"),
    [action, setAction] = useState<Call["action"]>("play"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [time, setTime] = useState(Date.now()),
    [tab, setTab] = useState("game"),
    [inspect, setInspect] = useState(false);
  const reportError = (e: Error) => setError(e.message);
  useEffect(() => {
    const unsubs = [
      onSnapshot(
        doc(api.db, "games", id),
        (s) => setGame(s.data() as Game),
        reportError,
      ),
      onSnapshot(
        doc(api.db, "users", uid, "plans", id),
        (s) => setPlan(s.data() as GamePlan),
        reportError,
      ),
      onSnapshot(
        query(collection(api.db, "games", id, "snaps"), orderBy("turn")),
        (s) => {
          setSnaps(s.docs.map((d) => d.data() as SnapPublic));
          setIndex(s.size - 1);
        },
        reportError,
      ),
    ];
    const tick = setInterval(() => setTime(Date.now()), 1000);
    return () => {
      unsubs.forEach((u) => u());
      clearInterval(tick);
    };
  }, [api, id, uid]);
  useEffect(() => {
    if (g?.status !== "complete" || g.members.length < 2) return;
    return onSnapshot(
      query(collection(api.db, "games", id, "film"), orderBy("turn")),
      (s) =>
        setFilm(
          s.docs.map(
            (d) =>
              d.data() as Snap & { offPlay: Play | null; defPlay: Play | null },
          ),
        ),
      reportError,
    );
  }, [api, id, g?.status, g?.members.length]);
  useEffect(() => {
    if (g?.status !== "complete" || g.members.length < 2) return;
    return onSnapshot(
      collection(api.db, "games", id, "reports"),
      (s) =>
        setReports(
          Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Analytics])),
        ),
      reportError,
    );
  }, [api, id, g?.status, g?.members.length]);
  const side = g?.members[g.possession] === uid ? "offense" : "defense";
  useEffect(() => {
    setPlayId(side === "offense" ? "offense-1" : "defense-1");
    setAction(
      g?.phase === "conversion" && side === "offense" ? "extraPoint" : "play",
    );
    setInspect(false);
  }, [g?.turn, side, g?.phase]);
  async function run(kind: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      await api.call({ kind, gameId: id, ...extra });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  if (!g || !plan)
    return (
      <div className="empty">
        {error || "Loading your game…"}
        <button onClick={onBack}>Back</button>
      </div>
    );
  const chosen = plan.plays.find((p) => p.id === playId);
  const snap = snaps[index];
  const detail = film.find((s) => s.turn === snap?.turn);
  const locked = g.locks.includes(uid);
  const seconds = Math.max(0, Math.ceil((g.deadline - time) / 1000));
  const mine = g.members.indexOf(uid),
    opponent = g.members[1 - mine];
  const scout = reports[opponent];
  return (
    <section>
      <button className="back" onClick={onBack}>
        ← Games
      </button>
      <div className="scoreboard">
        <p className="eyebrow">
          {g.status === "complete"
            ? "FINAL"
            : g.status === "waiting"
              ? "INVITATION"
              : clockText(g)}
        </p>
        <div className="score-line">
          {g.names.map((name, i) => (
            <div key={i}>
              <span>
                {g.possession === i && g.status === "active" ? "● " : ""}
                {name}
              </span>
              <strong>{g.score[i]}</strong>
            </div>
          ))}
          {g.members.length === 1 && (
            <div>
              <span>Opponent</span>
              <strong>—</strong>
            </div>
          )}
        </div>
        <p>
          {g.status === "active"
            ? `${g.phase === "conversion" ? "Conversion" : `${g.down}${["", "st", "nd", "rd", "th"][g.down]} & ${g.distance}`} · ${g.spot < 50 ? `Own ${g.spot}` : `Opp ${100 - g.spot}`} · Drive ${g.drive}`
            : g.status === "complete"
              ? g.members.length < 2
                ? "Canceled invitation"
                : g.winner
                  ? `${g.names[g.members.indexOf(g.winner)]} wins`
                  : "Tie game"
              : "Share this code with your opponent"}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {g.status === "waiting" ? (
        <div className="card center">
          <h3>Invite a coach</h3>
          <p className="invite-code">{id}</p>
          <p>
            Send this code to your opponent. They can sign in and tap Join game.
          </p>
          <button
            className="primary full"
            onClick={async () => {
              try {
                if (navigator.share)
                  await navigator.share({
                    title: "Gridiron Chess",
                    text: `Join my game: ${id}`,
                    url: `${location.origin}/?invite=${id}`,
                  });
                else {
                  await navigator.clipboard.writeText(
                    `${location.origin}/?invite=${id}`,
                  );
                  setError("Invite link copied.");
                }
              } catch {
                setError(`Share this game code: ${id}`);
              }
            }}
          >
            Share invite
          </button>
          <button disabled={busy} onClick={() => run("cancel")}>
            Cancel invitation
          </button>
        </div>
      ) : (
        <>
          <div className="tabs">
            {(g.status === "complete"
              ? ["game", "film", "stats", "scout"]
              : ["game", "log"]
            ).map((t) => (
              <button
                className={tab === t ? "selected" : ""}
                onClick={() => setTab(t)}
                key={t}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "stats" && reports[uid] ? (
            <>
              <AnalyticsView data={reports[uid]} />
            </>
          ) : tab === "scout" ? (
            <div>
              <h2>Opponent tendencies</h2>
              <p className="muted">Only calls from this game are shown.</p>
              {scout &&
                Object.values(scout.plays).map((p) => (
                  <details className="card" key={`${p.side}-${p.name}`}>
                    <summary>
                      {p.name}
                      <span>
                        {p.total.calls} {p.side} calls
                      </span>
                    </summary>
                    <Tiles
                      items={[
                        ["Yards/play", avg(p.total.yards, p.total.calls)],
                        ["Success", pct(p.total.success, p.total.calls)],
                        ["Primary targets", p.total.primaryTargets],
                        ["Secondary targets", p.total.secondaryTargets],
                      ]}
                    />
                    {Object.entries(p.splits).map(([key, m]) => (
                      <p className="split" key={key}>
                        {key}
                        <span>
                          {m.calls} calls · {avg(m.yards, m.calls)} yd/play
                        </span>
                      </p>
                    ))}
                  </details>
                ))}
              {film.length > 0 && (
                <div className="card">
                  <h3>Downfield decoys & reads</h3>
                  {film
                    .filter(
                      (s) => s.offense === 1 - mine && s.target && s.offPlay,
                    )
                    .map((s) => (
                      <p key={s.turn}>
                        Snap {s.turn + 1}: {s.offPlay!.name} · reads{" "}
                        {s.offPlay!.reads.join(" → ")} · target {s.target} (
                        {s.read === 1 ? "primary" : "secondary"})
                      </p>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {snap && tab !== "log" && (
                <div className="card replay-card">
                  <div className="section-head">
                    <h3>Snap {snap.turn + 1}</h3>
                    <span className="pill">
                      {snap.outcome} · {snap.yards} yd
                    </span>
                  </div>
                  <Replay frames={snap.frames} />
                  <ul className="reasons">
                    {snap.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  {snap.target && (
                    <p className="muted">
                      Target {snap.target}
                      {detail?.target ? ` · Read ${detail.read}` : ""} · Throw{" "}
                      {snap.timeToThrow.toFixed(2)}s · Separation{" "}
                      {snap.separation.toFixed(1)} yd
                    </p>
                  )}
                </div>
              )}
              {tab === "film" && detail?.offPlay && detail?.defPlay && (
                <div className="card">
                  <h3>Revealed play calls</h3>
                  <p>
                    <b>{detail.offPlayName}</b> vs <b>{detail.defPlayName}</b>
                  </p>
                  <p>
                    Reads: {detail.offPlay.reads.join(" → ")} ·{" "}
                    {detail.coverage} defense
                  </p>
                  <Field play={detail.offPlay} second={detail.defPlay} />
                  <div className="assignment-list">
                    {Object.entries(detail.defPlay.assignments).map(
                      ([id, a]) => (
                        <p key={id}>
                          <b>{id}</b>{" "}
                          {a.kind === "man"
                            ? `Man → ${a.target}`
                            : a.kind === "zone"
                              ? `Zone at (${a.center.x}, ${a.center.y}), radius ${a.radius} yd`
                              : a.kind}
                        </p>
                      ),
                    )}
                  </div>
                </div>
              )}
              {g.status === "active" && tab === "game" && (
                <div className="card call-card">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">You're calling {side}</p>
                      <h3>{locked ? "Call locked" : "Choose your call"}</h3>
                    </div>
                    <strong className={seconds < 20 ? "warning" : ""}>
                      {seconds}s
                    </strong>
                  </div>
                  <p className="muted">
                    {g.locks.includes(opponent)
                      ? "Opponent is locked."
                      : "Waiting for opponent to lock."}{" "}
                    Calls remain hidden.
                  </p>
                  {side === "offense" && (
                    <>
                      <label>
                        QB mentality
                        <select
                          disabled={locked || busy}
                          value={mentality}
                          onChange={(e) =>
                            setMentality(e.target.value as Mentality)
                          }
                        >
                          <option value="conservative">Conservative</option>
                          <option value="balanced">Balanced</option>
                          <option value="aggressive">Aggressive</option>
                        </select>
                      </label>
                      <p className="hint">
                        {mentality === "conservative"
                          ? "Larger windows, quicker progression, earlier throwaways."
                          : mentality === "aggressive"
                            ? "Tighter windows, longer holds, more forced throws."
                            : "Balanced windows and pocket patience."}
                      </p>
                      <label>
                        Decision
                        <select
                          disabled={locked || busy}
                          value={action}
                          onChange={(e) =>
                            setAction(e.target.value as Call["action"])
                          }
                        >
                          {g.phase === "conversion" ? (
                            <>
                              <option value="extraPoint">
                                Kick extra point
                              </option>
                              <option value="twoPoint">
                                Run selected play for two
                              </option>
                            </>
                          ) : (
                            <>
                              <option value="play">Run selected play</option>
                              {g.quarter <= 4 && (
                                <option value="punt">Punt</option>
                              )}
                              <option value="fieldGoal">
                                Field goal ({117 - g.spot} yards)
                              </option>
                            </>
                          )}
                        </select>
                      </label>
                    </>
                  )}
                  <div className="call-options">
                    {plan.plays
                      .filter((p) => p.side === side)
                      .map((p) => (
                        <button
                          key={p.id}
                          disabled={locked || busy}
                          className={playId === p.id ? "selected" : ""}
                          onClick={() => setPlayId(p.id)}
                        >
                          <span>{p.id.slice(-1)}</span>
                          <strong>{p.name}</strong>
                          <small>
                            {side === "offense"
                              ? p.kind === "run"
                                ? "RB run"
                                : p.reads.join(" → ")
                              : "Defense"}
                          </small>
                        </button>
                      ))}
                  </div>
                  <button onClick={() => setInspect(!inspect)}>
                    {inspect ? "Hide" : "Inspect"} selected play
                  </button>
                  {inspect && chosen && <Field play={chosen} />}
                  {seconds > 0 ? (
                    <button
                      className="primary full"
                      disabled={locked || busy || !chosen}
                      onClick={() =>
                        run("submit", {
                          call: {
                            playId,
                            mentality,
                            action: side === "defense" ? "play" : action,
                            turn: g.turn,
                          },
                        })
                      }
                    >
                      {locked
                        ? "Locked · waiting for resolution"
                        : busy
                          ? "Submitting…"
                          : "Lock call"}
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      className="primary full"
                      onClick={() => run("timeout")}
                    >
                      Resolve expired clock
                    </button>
                  )}
                  <p className="muted">
                    Two minutes per call. Missing calls use an automatic
                    selection. Three consecutive missed calls end the game.
                  </p>
                </div>
              )}
              {(tab === "film" || tab === "log" || g.status === "complete") && (
                <div>
                  <h3>Play-by-play</h3>
                  {snaps.length === 0 ? (
                    <p className="empty">No snaps recorded.</p>
                  ) : (
                    [...snaps].reverse().map((s) => (
                      <button
                        key={s.turn}
                        className={`list-card ${index === s.turn ? "selected" : ""}`}
                        onClick={() => {
                          setIndex(snaps.findIndex((p) => p.turn === s.turn));
                          if (tab === "log") setTab("game");
                        }}
                      >
                        <div>
                          <strong>
                            #{s.turn + 1} · {s.outcome}
                            {s.td ? " · TD" : ""}
                          </strong>
                          <span>
                            {clockText(s)} · {s.down} & {s.distance} ·{" "}
                            {g.names[s.offense]}
                          </span>
                        </div>
                        <b>
                          {s.yards}
                          <small>yards</small>
                        </b>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
          {g.status === "active" && (
            <button
              className="danger full"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Concede this game? Your opponent will receive the win.",
                  )
                )
                  run("forfeit");
              }}
            >
              Concede game
            </button>
          )}
          {g.status === "complete" && g.endedAt > 0 && (
            <p className="muted center">
              Completed {new Date(g.endedAt).toLocaleString()}
            </p>
          )}
        </>
      )}
    </section>
  );
}
