import { useEffect, useState, useRef } from "react";
import {
  User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { collection, doc, onSnapshot, query, where } from "./sync";
import { Services } from "./firebase-client";
import { Analytics, Game, Play, Profile, VERSION } from "./model";
import { PlayEditor } from "./PlayEditor";
import { GameScreen, clockText } from "./GameScreen";
import { AnalyticsView, Tiles } from "./Stats";
import { analytics } from "./analytics";
import { keyRatings, ratingLabels } from "./starters";
const icons: Record<string, string> = {
  Home: "⌂",
  Playbook: "▤",
  Team: "♟",
  Games: "◷",
  Analytics: "▥",
};
export default function App({ api }: { api: Services }) {
  const [user, setUser] = useState<User | null | undefined>(undefined),
    [profile, setProfile] = useState<Profile | null>(null),
    [profileLoaded, setProfileLoaded] = useState(false),
    [plays, setPlays] = useState<Play[]>([]),
    [games, setGames] = useState<Game[]>([]),
    [stats, setStats] = useState<Analytics>(analytics()),
    [nav, setNav] = useState("Home"),
    [editing, setEditing] = useState<Play | null>(null),
    [gameId, setGameId] = useState(""),
    [playSide, setPlaySide] = useState("offense"),
    [analyticId, setAnalyticId] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [teamName, setTeamName] = useState(""),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [invite, setInvite] = useState(
      new URLSearchParams(location.search).get("invite")?.toUpperCase() || "",
    );
  const authUid = useRef<string | null>(null);
  useEffect(
    () =>
      onAuthStateChanged(api.auth, (u) => {
        setUser(u);
        if (authUid.current === (u?.uid ?? null)) return;
        authUid.current = u?.uid ?? null;
        setProfile(null);
        setProfileLoaded(false);
        setGames([]);
        setPlays([]);
        setStats(analytics());
        setGameId("");
      }),
    [api],
  );
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    const err = (e: Error) => setError(e.message);
    return onSnapshot(
      doc(api.db, "users", user.uid),
      (s) => {
        const p = s.exists() ? (s.data() as Profile) : null;
        setProfile(p);
        setProfileLoaded(true);
        if (p) {
          setName(p.name);
          setTeamName(p.teamName);
        }
      },
      err,
    );
  }, [api, user]);
  useEffect(() => {
    if (!user || !profile) return;
    const err = (e: Error) => setError(e.message);
    const subs = [
      onSnapshot(
        collection(api.db, "users", user.uid, "plays"),
        (s) =>
          setPlays(
            s.docs
              .map((d) => d.data() as Play)
              .sort((a, b) => a.id.localeCompare(b.id)),
          ),
        err,
      ),
      onSnapshot(
        query(
          collection(api.db, "games"),
          where("members", "array-contains", user.uid),
        ),
        (s) =>
          setGames(
            s.docs
              .map((d) => d.data() as Game)
              .sort((a, b) => b.createdAt - a.createdAt),
          ),
        err,
      ),
      onSnapshot(
        doc(api.db, "users", user.uid, "stats", "career"),
        (s) =>
          setStats((old) => ({
            ...(s.exists() ? (s.data() as Analytics) : analytics()),
            plays: old.plays,
          })),
        err,
      ),
      onSnapshot(
        collection(api.db, "users", user.uid, "playStats"),
        (s) =>
          setStats((old) => ({
            ...old,
            plays: Object.fromEntries(
              s.docs.map((d) => [d.data().key, d.data().value]),
            ),
          })),
        err,
      ),
    ];
    return () => subs.forEach((u) => u());
  }, [api, user, !!profile]);
  async function task(fn: () => Promise<unknown>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete this action.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function authenticate(e: React.FormEvent) {
    e.preventDefault();
    await task(async () => {
      if (register) {
        await createUserWithEmailAndPassword(api.auth, email, password);
        await api.call({ kind: "bootstrap", name });
      } else await signInWithEmailAndPassword(api.auth, email, password);
    });
  }
  async function create() {
    await task(async () => {
      const r = await api.call({ kind: "create" });
      setGameId(r.gameId);
      setNav("Games");
    });
  }
  async function join(e: React.FormEvent) {
    e.preventDefault();
    await task(async () => {
      const r = await api.call({
        kind: "join",
        gameId: invite.replaceAll(/[^A-Z0-9]/g, ""),
      });
      setGameId(r.gameId);
      setNav("Games");
      setInvite("");
      history.replaceState(null, "", location.pathname);
    });
  }
  const navTo = (n: string) => {
    setNav(n);
    setEditing(null);
    setGameId("");
    setAnalyticId("");
    setError("");
    setNotice("");
    window.scrollTo(0, 0);
  };
  const gamesList = (list: Game[]) =>
    list.map((g) => (
      <button
        className="list-card"
        key={g.id}
        onClick={() => {
          setGameId(g.id);
          setNav("Games");
        }}
      >
        <div>
          <strong>
            {g.names.filter((_, i) => g.members[i] !== user?.uid)[0] ||
              "Open invitation"}
          </strong>
          <span>
            {g.status === "active"
              ? `${clockText(g)} · ${g.locks.includes(user!.uid) ? "Call locked" : "Your call needed"}`
              : g.status === "waiting"
                ? g.id
                : new Date(g.endedAt).toLocaleDateString()}
          </span>
        </div>
        <b>
          {g.status === "waiting" ? "Invite" : `${g.score[0]}–${g.score[1]}`}
          <small>{g.status}</small>
        </b>
      </button>
    ));
  if (user === undefined)
    return <div className="loading">Loading your club…</div>;
  if (!user)
    return (
      <main className="auth">
        <div className="brand-mark">GC</div>
        <p className="eyebrow">Football is a thinking game.</p>
        <h1>
          GRIDIRON
          <br />
          <em>CHESS</em>
        </h1>
        <p className="intro">
          Draw the routes. Read the defense.
          <br />
          Make the call that changes the game.
        </p>
        <div className="card">
          <div className="tabs">
            <button
              className={!register ? "selected" : ""}
              onClick={() => setRegister(false)}
            >
              Sign in
            </button>
            <button
              className={register ? "selected" : ""}
              onClick={() => setRegister(true)}
            >
              Create account
            </button>
          </div>
          <form onSubmit={authenticate}>
            {register && (
              <label>
                Coach name
                <input
                  required
                  minLength={2}
                  maxLength={24}
                  autoComplete="nickname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                minLength={6}
                autoComplete={register ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
            <button className="primary full" disabled={busy}>
              {busy
                ? "Connecting…"
                : register
                  ? "Create your club"
                  : "Enter the clubhouse"}
            </button>
          </form>
          {!register && (
            <button
              className="text-button"
              disabled={busy || !email}
              onClick={() =>
                task(async () => {
                  await sendPasswordResetEmail(api.auth, email);
                  setNotice("Password reset requested. Check your email.");
                })
              }
            >
              Reset password
            </button>
          )}
        </div>
        <p className="muted center">
          Live opponents · Server-resolved snaps · Private playbooks
          <br />
          Version {VERSION}
        </p>
      </main>
    );
  if (!profile)
    return (
      <main className="auth">
        <h1>Your club</h1>
        {profileLoaded ? (
          <>
            <p>
              Finish creating your coach profile. Your roster and ten play slots
              will be prepared automatically.
            </p>
            <label>
              Coach name
              <input
                minLength={2}
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              className="primary full"
              disabled={busy || name.trim().length < 2}
              onClick={() => task(() => api.call({ kind: "bootstrap", name }))}
            >
              Create club
            </button>
          </>
        ) : (
          <p>Loading profile…</p>
        )}
        {error && <p className="error">{error}</p>}
        <button onClick={() => signOut(api.auth)}>Sign out</button>
      </main>
    );
  return (
    <div className="app">
      <header>
        <button className="wordmark" onClick={() => navTo("Home")}>
          GC
          <span>
            GRIDIRON CHESS<small>COACH'S CLUB · v{VERSION}</small>
          </span>
        </button>
        <button
          className={`avatar ${nav === "Profile" ? "selected" : ""}`}
          aria-label="Profile"
          onClick={() => navTo("Profile")}
        >
          {profile.name.slice(0, 2).toUpperCase()}
        </button>
      </header>
      {!online && (
        <div className="offline" role="status">
          Offline · Reconnect to save changes or lock a call.
        </div>
      )}
      <main>
        {error && (
          <p className="error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              ×
            </button>
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {editing ? (
          <PlayEditor
            initial={editing}
            onClose={() => setEditing(null)}
            onSave={async (play) => {
              await api.call({ kind: "savePlay", play });
            }}
          />
        ) : gameId ? (
          <GameScreen
            key={gameId}
            api={api}
            id={gameId}
            uid={user.uid}
            onBack={() => setGameId("")}
          />
        ) : nav === "Home" ? (
          <>
            <section className="hero">
              <p className="eyebrow">Welcome back, Coach {profile.name}</p>
              <h1>
                Your next
                <br />
                <em>winning call.</em>
              </h1>
              <p>{profile.teamName}</p>
              <button
                className="primary"
                disabled={busy || plays.length !== 10 || !online}
                onClick={create}
              >
                Invite an opponent <span>↗</span>
              </button>
            </section>
            <Tiles
              items={[
                ["Wins", stats.wins],
                ["Losses", stats.losses],
                ["Games", stats.games],
              ]}
            />
            <form className="card join" onSubmit={join}>
              <label>
                Have an invite?
                <input
                  aria-label="Invite code"
                  placeholder="12-character game code"
                  autoCapitalize="characters"
                  value={invite}
                  maxLength={14}
                  onChange={(e) => setInvite(e.target.value.toUpperCase())}
                />
              </label>
              <button
                className="primary"
                disabled={busy || invite.length < 12 || !online}
              >
                Join game
              </button>
            </form>
            <div className="section-head">
              <h2>On the clock</h2>
              <span className="pill">
                {games.filter((g) => g.status === "active").length} active
              </span>
            </div>
            {games.some((g) => g.status !== "complete") ? (
              gamesList(games.filter((g) => g.status !== "complete"))
            ) : (
              <p className="empty">
                Your roster is ready. Shape your playbook, then invite another
                coach.
              </p>
            )}
            <div className="section-head">
              <h2>Your game plan</h2>
              <button onClick={() => navTo("Playbook")}>Edit plays →</button>
            </div>
            <div className="two-col">
              <div className="card">
                <span className="eyebrow">OFFENSE</span>
                <h3>
                  5 calls.
                  <br />
                  Two reads.
                </h3>
                <p className="muted">Every route has a purpose.</p>
              </div>
              <div className="card">
                <span className="eyebrow">DEFENSE</span>
                <h3>
                  11 players.
                  <br />
                  One answer.
                </h3>
                <p className="muted">Take their best option away.</p>
              </div>
            </div>
            {games.some((g) => g.status === "complete") && (
              <>
                <h2>Recent finals</h2>
                {gamesList(
                  games.filter((g) => g.status === "complete").slice(0, 3),
                )}
              </>
            )}
          </>
        ) : nav === "Playbook" ? (
          <section>
            <p className="eyebrow">Make it your system</p>
            <h1>Playbook</h1>
            <p className="muted">
              Five offense and five defense slots form your active plan. Edit
              any starter into your own custom call.
            </p>
            <div className="tabs">
              {["offense", "defense"].map((s) => (
                <button
                  key={s}
                  className={s === playSide ? "selected" : ""}
                  onClick={() => setPlaySide(s)}
                >
                  {s} · 5
                </button>
              ))}
            </div>
            {plays
              .filter((p) => p.side === playSide)
              .map((p) => (
                <article className="card" key={p.id}>
                  <div className="section-head">
                    <div>
                      <span className="eyebrow">CALL {p.id.slice(-1)}</span>
                      <h3>{p.name}</h3>
                    </div>
                    <span className="play-symbol">
                      {p.side === "offense" ? "↗" : "⊙"}
                    </span>
                  </div>
                  <p className="muted">
                    {p.side === "offense"
                      ? `${p.kind === "run" ? "RB run" : p.concept} · ${p.reads.join(" → ")}`
                      : Object.values(p.assignments).reduce(
                          (m, a) => ({ ...m, [a.kind]: (m[a.kind] || 0) + 1 }),
                          {} as Record<string, number>,
                        ) &&
                        Object.entries(
                          Object.values(p.assignments).reduce(
                            (m, a) => ({
                              ...m,
                              [a.kind]: (m[a.kind] || 0) + 1,
                            }),
                            {} as Record<string, number>,
                          ),
                        )
                          .map(([k, v]) => `${v} ${k}`)
                          .join(" · ")}
                  </p>
                  <div className="button-row">
                    <button className="primary" onClick={() => setEditing(p)}>
                      Design play
                    </button>
                    <button
                      onClick={() => {
                        setAnalyticId(p.id);
                        setNav("Analytics");
                      }}
                    >
                      Performance
                    </button>
                  </div>
                </article>
              ))}
          </section>
        ) : nav === "Team" ? (
          <section>
            <p className="eyebrow">{profile.teamName}</p>
            <h1>Your roster</h1>
            <p className="muted">
              23 athletes · Equal starting talent for every coach. Ratings
              affect movement, coverage, pressure, decisions, and ball skills.
            </p>
            {["Offense", "Defense", "Special teams"].map((group, gi) => (
              <div key={group}>
                <h2>{group}</h2>
                {profile.roster
                  .slice(
                    gi === 0 ? 0 : gi === 1 ? 11 : 22,
                    gi === 0 ? 11 : gi === 1 ? 22 : 23,
                  )
                  .map((p) => (
                    <details className="card athlete" key={p.id}>
                      <summary>
                        <span className="position">{p.position}</span>
                        <div>
                          {p.name}
                          <small>{p.position}</small>
                        </div>
                        <b>
                          {p.overall}
                          <small>OVR</small>
                        </b>
                      </summary>
                      <div className="ratings">
                        {keyRatings(p.position).map((r) => (
                          <div key={r}>
                            <span>{ratingLabels[r]}</span>
                            <meter min="0" max="100" value={p.ratings[r]} />
                            <b>{p.ratings[r]}</b>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
              </div>
            ))}
          </section>
        ) : nav === "Games" ? (
          <section>
            <p className="eyebrow">Every call counts</p>
            <h1>Games</h1>
            <button
              className="primary full"
              disabled={busy || !online}
              onClick={create}
            >
              Create invitation
            </button>
            <form className="card join" onSubmit={join}>
              <label>
                Invite code
                <input
                  value={invite}
                  autoCapitalize="characters"
                  maxLength={14}
                  onChange={(e) => setInvite(e.target.value.toUpperCase())}
                />
              </label>
              <button disabled={busy || invite.length < 12 || !online}>
                Join
              </button>
            </form>
            <h2>Active & waiting</h2>
            {gamesList(games.filter((g) => g.status !== "complete"))}
            {!games.some((g) => g.status !== "complete") && (
              <p className="empty">No active games.</p>
            )}
            <h2>Game history</h2>
            {gamesList(games.filter((g) => g.status === "complete"))}
            {!games.some((g) => g.status === "complete") && (
              <p className="empty">
                Completed games, statistics, and film will stay here.
              </p>
            )}
          </section>
        ) : nav === "Analytics" ? (
          <AnalyticsView
            key={analyticId}
            data={stats}
            initialPlay={analyticId}
          />
        ) : (
          <section>
            <p className="eyebrow">Account & club</p>
            <h1>Profile</h1>
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                task(async () => {
                  await api.call({ kind: "profile", name, teamName });
                  setNotice("Profile saved.");
                });
              }}
            >
              <label>
                Coach name
                <input
                  required
                  minLength={2}
                  maxLength={24}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Team name
                <input
                  required
                  minLength={2}
                  maxLength={30}
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </label>
              <p className="muted">{user.email}</p>
              <button disabled={busy} className="primary full">
                Save profile
              </button>
            </form>
            <details className="card">
              <summary>Game rules & controls</summary>
              <p>
                Four three-minute quarters. The clock runs by play duration plus
                a 22-second runoff on in-bounds plays. New halves begin at the
                25. Touchdowns are six; kick for one or run your selected play
                for two. Field goals and punts can be called between snaps.
              </p>
              <p>
                Overtime gives each team a possession from the opponent’s 25.
                Both teams receive equal possessions; pairs repeat until one
                team leads. No punts in overtime.
              </p>
              <p>
                Draw routes with a finger. Edit points to reshape a route.
                Select a defender, choose an assignment, and drag zone centers
                onto the field. The server freezes your plan when you create or
                join a game.
              </p>
              <p>
                Lock your call within two minutes. A missed call uses the first
                saved play (or a punt on fourth down). Three consecutive missed
                calls end the game. Both missing players can produce a tie.
                Active opponents never see your play name, assignments, or
                selected reads. Actual movement is visible during the replay.
                Full used plays unlock when the game ends.
              </p>
            </details>
            <details className="card">
              <summary>Install on your phone</summary>
              <p>
                On iPhone, use Safari’s Share menu → Add to Home Screen. On
                Android, use your browser’s Install app or Add to Home Screen
                action.
              </p>
            </details>
            <button
              className="danger full"
              onClick={() => task(() => signOut(api.auth))}
            >
              Sign out
            </button>
            <p className="muted center">Gridiron Chess · Version {VERSION}</p>
          </section>
        )}
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {Object.keys(icons).map((n) => (
          <button
            key={n}
            aria-label={n}
            aria-current={nav === n ? "page" : undefined}
            className={nav === n ? "active" : ""}
            onClick={() => navTo(n)}
          >
            <span>{icons[n]}</span>
            {n}
          </button>
        ))}
      </nav>
    </div>
  );
}
