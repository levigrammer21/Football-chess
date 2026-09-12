import { useEffect, useRef, useState } from "react";
import {
  Frame,
  Play,
  Point,
  Receiver,
  starts,
  eligible,
  defensePositions,
} from "./model";
const fy = (y: number) => 65 - y;
export function Field({
  play,
  second,
  frame,
  selected,
  onSelect,
  onRoute,
  onZone,
  mode = "draw",
}: {
  play?: Play;
  second?: Play;
  frame?: Frame;
  selected?: string;
  onSelect?: (id: string) => void;
  onRoute?: (id: Receiver, p: Point[]) => void;
  onZone?: (id: string, p: Point) => void;
  mode?: "draw" | "edit";
}) {
  const camera = frame ? Math.max(0, frame.ball.y - 35) : 0;
  const fy = (y: number) => 65 + camera - y;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; points: Point[]; index: number } | null>(
    null,
  );
  const [draft, setDraft] = useState<Point[] | null>(null);
  const offense =
    play?.side === "offense"
      ? play
      : second?.side === "offense"
        ? second
        : undefined;
  const defense =
    play?.side === "defense"
      ? play
      : second?.side === "defense"
        ? second
        : undefined;
  const point = (e: React.PointerEvent): Point => {
    const rect = svg.current!.getBoundingClientRect();
    return {
      x:
        Math.round(
          Math.max(
            0,
            Math.min(53.3, ((e.clientX - rect.left) / rect.width) * 53.3),
          ) * 10,
        ) / 10,
      y:
        Math.round(
          Math.max(
            -10,
            Math.min(60, 65 - ((e.clientY - rect.top) / rect.height) * 80),
          ) * 10,
        ) / 10,
    };
  };
  function down(e: React.PointerEvent<SVGSVGElement>) {
    if (!onRoute && !onZone) return;
    e.preventDefault();
    const id =
      (e.target as Element)
        .closest("[data-player]")
        ?.getAttribute("data-player") || selected;
    if (!id) return;
    onSelect?.(id);
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    if (play?.side === "offense" && eligible.includes(id as Receiver)) {
      const pts = play.routes[id as Receiver].map((p) => ({ ...p }));
      let index = -1;
      if (mode === "edit") {
        const ds = pts
          .map((q, i) => ({ i, d: Math.hypot(q.x - p.x, q.y - p.y) }))
          .filter((x) => x.i > 0)
          .sort((a, b) => a.d - b.d);
        index = ds[0]?.i ?? 1;
      }
      drag.current = {
        id,
        points: mode === "draw" ? [{ ...starts[id] }, p] : pts,
        index,
      };
      setDraft(drag.current.points);
    } else if (play?.side === "defense" && defensePositions.includes(id)) {
      drag.current = { id, points: [p], index: 0 };
      if (play.assignments[id].kind === "zone") onZone?.(id, p);
    }
  }
  function moving(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const d = drag.current,
      p = point(e);
    if (play?.side === "defense") {
      if (play.assignments[d.id].kind === "zone") onZone?.(d.id, p);
      return;
    }
    if (mode === "edit") d.points[d.index] = p;
    else if (
      Math.hypot(
        p.x - d.points[d.points.length - 1].x,
        p.y - d.points[d.points.length - 1].y,
      ) > 0.8
    ) {
      if (d.points.length >= 64)
        d.points = d.points.filter((_, i) => i === 0 || i % 2 === 1);
      d.points.push(p);
    }
    setDraft([...d.points]);
  }
  function up(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (d && play?.side === "offense" && d.points.length >= 2)
      onRoute?.(d.id as Receiver, d.points);
    drag.current = null;
    setDraft(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const positions =
    frame?.players ??
    Object.fromEntries(
      Object.entries(starts).map(([id, p]) => [
        `${defensePositions.includes(id) ? "D" : "O"}:${id}`,
        p,
      ]),
    );
  const view = (p: Point) => `${p.x},${fy(p.y)}`;
  return (
    <svg
      ref={svg}
      className={`field ${onRoute || onZone ? "editable" : ""}`}
      viewBox="0 0 53.3 80"
      role="img"
      aria-label={
        onRoute
          ? "Touch football field: select a receiver and draw a route"
          : onZone
            ? "Touch football field: select a defender and place a zone"
            : "Tactical football field"
      }
      onPointerDown={down}
      onPointerMove={moving}
      onPointerUp={up}
      onPointerCancel={() => {
        drag.current = null;
        setDraft(null);
      }}
    >
      <defs>
        <pattern
          id="turf"
          width="53.3"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <rect width="53.3" height="10" fill="#103e35" />
          <rect y="10" width="53.3" height="10" fill="#12463a" />
        </pattern>
      </defs>
      <rect width="53.3" height="80" rx="2" fill="url(#turf)" />
      {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        .filter((y) => fy(y) > 0 && fy(y) < 80)
        .map((y) => (
          <g key={y}>
            <line
              x1="1"
              y1={fy(y)}
              x2="52.3"
              y2={fy(y)}
              stroke="#b7dec033"
              strokeWidth=".2"
            />
            <text x="2" y={fy(y) - 0.8} fill="#c1dbcf80" fontSize="1.7">
              {y === 0 ? "LOS" : y}
            </text>
          </g>
        ))}
      <line
        x1="0"
        y1={fy(0)}
        x2="53.3"
        y2={fy(0)}
        stroke="#ffc967"
        strokeWidth=".4"
      />
      {!frame &&
        offense &&
        eligible.map((id) => (
          <polyline
            key={id}
            points={(draft && drag.current?.id === id
              ? draft
              : offense.routes[id]
            )
              .map(view)
              .join(" ")}
            fill="none"
            stroke={
              offense.reads[0] === id
                ? "#ffcf73"
                : offense.reads[1] === id
                  ? "#91e6ee"
                  : "#a7c7c0"
            }
            strokeWidth={
              id === selected?.replace("O:", "")?.replace("D:", "")
                ? ".65"
                : ".35"
            }
            strokeDasharray={offense.reads.includes(id) ? undefined : "1 1"}
          />
        ))}
      {!frame &&
        defense &&
        defensePositions.map((id) => {
          const a = defense.assignments[id],
            s = starts[id];
          const end =
            a.kind === "zone"
              ? a.center
              : a.kind === "man"
                ? starts[a.target]
                : a.kind === "spy"
                  ? { x: 26.5, y: 4 }
                  : a.kind === "contain"
                    ? { x: s.x > 26 ? 36 : 17, y: -3 }
                    : starts.QB;
          return (
            <g key={id}>
              {a.kind === "zone" && (
                <circle
                  cx={end.x}
                  cy={fy(end.y)}
                  r={a.radius}
                  fill="#ef889714"
                  stroke="#f49ba3"
                  strokeWidth=".25"
                />
              )}
              <line
                x1={s.x}
                y1={fy(s.y)}
                x2={end.x}
                y2={fy(end.y)}
                stroke="#ef8897"
                strokeDasharray={a.kind === "man" ? undefined : "1 1"}
                strokeWidth=".35"
              />
            </g>
          );
        })}
      {!frame &&
        mode === "edit" &&
        offense &&
        selected &&
        offense.routes[selected as Receiver]?.map(
          (p, i) =>
            i > 0 && (
              <circle key={i} cx={p.x} cy={fy(p.y)} r=".9" fill="#fff" />
            ),
        )}
      {Object.entries(positions).map(([key, p]) => {
        const id = key.slice(2);
        const isDefense = key[0] === "D";
        const canSelect = play?.side === (isDefense ? "defense" : "offense");
        const y = Math.max(2, Math.min(78, fy(p.y)));
        return (
          <g
            key={key}
            data-player={canSelect ? id : undefined}
            onClick={() => canSelect && onSelect?.(id)}
            role={canSelect && onSelect ? "button" : undefined}
            aria-label={canSelect ? `Select ${id}` : undefined}
            tabIndex={canSelect && onSelect ? 0 : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSelect) onSelect?.(id);
            }}
          >
            <circle cx={p.x} cy={y} r="2.3" fill="transparent" />
            <circle
              cx={p.x}
              cy={y}
              r="1.45"
              fill={isDefense ? "#eb8391" : "#c5ffe6"}
              stroke={selected === id ? "#ffd17b" : "#132d28"}
              strokeWidth={selected === id ? ".65" : ".3"}
            />
            <text
              pointerEvents="none"
              x={p.x}
              y={y + 0.45}
              fontSize="1.15"
              fontWeight="800"
              textAnchor="middle"
              fill="#122621"
            >
              {id}
            </text>
          </g>
        );
      })}
      {frame && (
        <ellipse
          cx={Math.max(1, Math.min(52, frame.ball.x))}
          cy={Math.max(2, Math.min(78, fy(frame.ball.y)))}
          rx=".8"
          ry=".5"
          fill="#ffca72"
          stroke="#352617"
          strokeWidth=".2"
        />
      )}
    </svg>
  );
}
export function Replay({ frames }: { frames: Frame[] }) {
  const [index, setIndex] = useState(0),
    [running, setRunning] = useState(true),
    [speed, setSpeed] = useState(1);
  useEffect(() => {
    setIndex(0);
    setRunning(true);
  }, [frames]);
  useEffect(() => {
    if (!running || index >= frames.length - 1) {
      if (index >= frames.length - 1) setRunning(false);
      return;
    }
    const delay = Math.max(
      20,
      ((frames[index + 1].t - frames[index].t) * 1000) / speed,
    );
    const id = setTimeout(() => setIndex((i) => i + 1), delay);
    return () => clearTimeout(id);
  }, [index, running, speed, frames]);
  if (!frames.length) return null;
  return (
    <div>
      <Field frame={frames[Math.min(index, frames.length - 1)]} />
      <div className="replay-controls">
        <button
          onClick={() => {
            if (index >= frames.length - 1) setIndex(0);
            setRunning(!running);
          }}
        >
          {running ? "Pause" : "Replay"}
        </button>
        <input
          aria-label="Replay timeline"
          type="range"
          min="0"
          max={frames.length - 1}
          value={index}
          onChange={(e) => {
            setRunning(false);
            setIndex(+e.target.value);
          }}
        />
        <button
          aria-label="Playback speed"
          onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 0.5 : 1))}
        >
          {speed}×
        </button>
      </div>
      <p className="muted center">
        {frames[Math.min(index, frames.length - 1)].event || "Developing play"}{" "}
        · {frames[Math.min(index, frames.length - 1)].t.toFixed(1)}s
      </p>
    </div>
  );
}
