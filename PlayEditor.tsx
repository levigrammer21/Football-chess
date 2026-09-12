import { useState } from "react";
import { Play, eligible, defensePositions, Receiver, starts } from "./model";
import { Field } from "./Field";
import { validatePlay } from "./validation";
export function PlayEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: Play;
  onSave: (p: Play) => Promise<void>;
  onClose: () => void;
}) {
  const [play, setPlay] = useState<Play>(structuredClone(initial)),
    [selected, setSelected] = useState<string>(
      initial.side === "offense" ? "WR1" : "CB1",
    ),
    [mode, setMode] = useState<"draw" | "edit">("draw"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  const off = play.side === "offense";
  function change(p: Partial<Play>) {
    setDirty(true);
    setPlay((p0) => ({ ...p0, ...p }));
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(validatePlay(play));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  const assignment = play.assignments[selected];
  return (
    <section className="editor">
      <div className="section-head">
        <div>
          <p className="eyebrow">
            {off ? "Offensive" : "Defensive"} design · slot {play.id.slice(-1)}
          </p>
          <h2>{play.name}</h2>
        </div>
        <button
          onClick={() => {
            if (!dirty || confirm("Discard unsaved changes?")) onClose();
          }}
        >
          Close
        </button>
      </div>
      <label>
        Play name
        <input
          maxLength={36}
          value={play.name}
          onChange={(e) => change({ name: e.target.value })}
        />
      </label>
      {off && (
        <div className="two-col">
          <label>
            Concept
            <input
              maxLength={28}
              value={play.concept}
              onChange={(e) => change({ concept: e.target.value })}
            />
          </label>
          <label>
            Play type
            <select
              value={play.kind}
              onChange={(e) => change({ kind: e.target.value as Play["kind"] })}
            >
              <option value="pass">Pass</option>
              <option value="run">RB run</option>
            </select>
          </label>
        </div>
      )}
      <div className="chips">
        {(off ? eligible : defensePositions).map((id) => (
          <button
            className={selected === id ? "selected" : ""}
            key={id}
            onClick={() => setSelected(id)}
          >
            {id}
          </button>
        ))}
      </div>
      <p className="hint">
        {off
          ? mode === "draw"
            ? `Draw ${selected}’s path with your finger. Touch another receiver to draw their route.`
            : "Drag near a white waypoint to reshape the selected route."
          : `${selected}: ${assignment?.kind}. ${assignment?.kind === "zone" ? "Drag on the field to position this zone." : "Choose an assignment below."}`}
      </p>
      <Field
        play={play}
        selected={selected}
        onSelect={(id) => {
          if (!off || eligible.includes(id as Receiver)) setSelected(id);
        }}
        mode={mode}
        onRoute={
          off
            ? (id, points) =>
                change({ routes: { ...play.routes, [id]: points } })
            : undefined
        }
        onZone={
          !off
            ? (id, p) =>
                change({
                  assignments: {
                    ...play.assignments,
                    [id]: { ...play.assignments[id], center: p },
                  },
                })
            : undefined
        }
      />
      {off ? (
        <>
          <div className="button-row">
            <button
              className={mode === "draw" ? "selected" : ""}
              onClick={() => setMode("draw")}
            >
              Draw / redraw
            </button>
            <button
              className={mode === "edit" ? "selected" : ""}
              onClick={() => setMode("edit")}
            >
              Edit points
            </button>
            <button
              onClick={() =>
                change({
                  routes: {
                    ...play.routes,
                    [selected]: [
                      { ...starts[selected] },
                      { ...starts[selected], y: starts[selected].y + 0.1 },
                    ],
                  },
                })
              }
            >
              Clear
            </button>
          </div>
          <div className="two-col">
            {[0, 1].map((i) => (
              <label key={i}>
                {i === 0 ? "1 · Primary read" : "2 · Secondary read"}
                <select
                  value={play.reads[i]}
                  onChange={(e) => {
                    const reads = [...play.reads] as [Receiver, Receiver];
                    const value = e.target.value as Receiver;
                    if (reads[1 - i] === value) reads[1 - i] = reads[i];
                    reads[i] = value;
                    change({ reads });
                  }}
                >
                  {eligible.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="muted">
            Gold: primary · Blue: secondary. All five routes affect coverage.
            For runs, RB follows the drawn path.
          </p>
        </>
      ) : (
        assignment && (
          <div className="card">
            <label>
              {selected} assignment
              <select
                value={assignment.kind}
                onChange={(e) =>
                  change({
                    assignments: {
                      ...play.assignments,
                      [selected]: {
                        ...assignment,
                        kind: e.target.value as typeof assignment.kind,
                      },
                    },
                  })
                }
              >
                {["man", "zone", "blitz", "rush", "spy", "contain"].map((k) => (
                  <option key={k} value={k}>
                    {
                      {
                        man: "Man coverage",
                        zone: "Zone coverage",
                        blitz: "Blitz",
                        rush: "Pass rush",
                        spy: "QB spy",
                        contain: "Contain",
                      }[k]
                    }
                  </option>
                ))}
              </select>
            </label>
            {assignment.kind === "man" && (
              <label>
                Cover receiver
                <select
                  value={assignment.target}
                  onChange={(e) =>
                    change({
                      assignments: {
                        ...play.assignments,
                        [selected]: {
                          ...assignment,
                          target: e.target.value as Receiver,
                        },
                      },
                    })
                  }
                >
                  {eligible.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            )}
            {assignment.kind === "zone" && (
              <label>
                Zone radius · {assignment.radius} yards
                <input
                  type="range"
                  min="3"
                  max="15"
                  value={assignment.radius}
                  onChange={(e) =>
                    change({
                      assignments: {
                        ...play.assignments,
                        [selected]: { ...assignment, radius: +e.target.value },
                      },
                    })
                  }
                />
              </label>
            )}
          </div>
        )
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save play"}
      </button>
      <p className="muted">
        Edits apply to new games. Existing games keep their locked game plans.
      </p>
    </section>
  );
}
