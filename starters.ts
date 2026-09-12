import {
  Athlete,
  Rating,
  Play,
  eligible,
  starts,
  offensePositions,
  defensePositions,
} from "./model";
export const ratingLabels: Record<Rating, string> = {
  accuracy: "Accuracy",
  arm: "Arm strength",
  awareness: "Awareness",
  decision: "Decision speed",
  mobility: "Mobility",
  pressure: "Pressure handling",
  speed: "Speed",
  acceleration: "Acceleration",
  route: "Route running",
  release: "Release",
  hands: "Hands",
  traffic: "Catch in traffic",
  vision: "Vision",
  elusiveness: "Elusiveness",
  receiving: "Receiving",
  blocking: "Blocking",
  man: "Man coverage",
  zone: "Zone coverage",
  reaction: "Reaction",
  ball: "Ball skills",
  tackling: "Tackling",
  coverage: "Coverage",
  recognition: "Play recognition",
  rush: "Pass rush",
  pursuit: "Pursuit",
  strength: "Strength",
  shedding: "Block shedding",
  kicking: "Kicking",
};
export function keyRatings(p: string): Rating[] {
  if (p === "QB")
    return ["accuracy", "arm", "awareness", "decision", "mobility", "pressure"];
  if (p === "RB")
    return [
      "speed",
      "acceleration",
      "vision",
      "elusiveness",
      "receiving",
      "blocking",
    ];
  if (p.startsWith("WR") || p === "TE")
    return ["speed", "acceleration", "route", "release", "hands", "traffic"];
  if (["LT", "LG", "C", "RG", "RT"].includes(p))
    return ["blocking", "strength", "recognition"];
  if (p.startsWith("LB"))
    return ["speed", "coverage", "recognition", "tackling", "rush", "pursuit"];
  if (["LE", "RE", "DT1", "DT2"].includes(p))
    return ["rush", "strength", "shedding", "pursuit", "tackling"];
  if (p === "K") return ["kicking"];
  return [
    "speed",
    "acceleration",
    "man",
    "zone",
    "reaction",
    "ball",
    "tackling",
  ];
}
export function roster(): Athlete[] {
  const first = [
    "Jordan",
    "Cameron",
    "Devin",
    "Alex",
    "Taylor",
    "Jesse",
    "Morgan",
    "Avery",
    "Casey",
    "Riley",
    "Drew",
    "Blake",
    "Dakota",
    "Logan",
    "Parker",
    "Reese",
    "Quinn",
    "Sam",
    "Jamie",
    "Chris",
    "Jules",
    "Robin",
    "Hayden",
  ];
  const last = [
    "Reed",
    "Banks",
    "Cole",
    "Warren",
    "Ellis",
    "Brooks",
    "Stone",
    "Hayes",
    "Grant",
    "West",
    "Knight",
    "Fox",
    "Lane",
    "Hart",
    "Ross",
    "Bell",
    "Young",
    "King",
    "Gray",
    "Ford",
    "Hill",
    "Scott",
    "James",
  ];
  return [...offensePositions, ...defensePositions, "K"].map((position, i) => {
    const ratings = {} as Record<Rating, number>;
    Object.keys(ratingLabels).forEach(
      (r, j) => (ratings[r as Rating] = 67 + ((i * 13 + j * 7) % 22)),
    );
    if (position === "QB") {
      ratings.speed = 68;
      ratings.accuracy = 82;
      ratings.arm = 85;
    }
    if (["LT", "LG", "C", "RG", "RT", "DT1", "DT2"].includes(position))
      ratings.speed = 53;
    return {
      id: position,
      name: `${first[i]} ${last[i]}`,
      position,
      ratings,
      overall: Math.round(
        keyRatings(position).reduce((s, r) => s + ratings[r], 0) /
          keyRatings(position).length,
      ),
    };
  });
}
export function starterPlays(): Play[] {
  return Array.from({ length: 10 }, (_, i) => {
    const n = i % 5;
    const side = i < 5 ? "offense" : "defense";
    const routes = {} as Play["routes"];
    eligible.forEach((p, j) => {
      const s = starts[p];
      const depth = [19, 9, 26, 12, 4][j];
      routes[p] = [
        { ...s },
        { x: s.x, y: 5 },
        {
          x: Math.max(2, Math.min(51, s.x + [0, 9, -11, 6, -9][(j + n) % 5])),
          y: depth + n * 1.5,
        },
      ];
    });
    const assignments: Play["assignments"] = {};
    defensePositions.forEach((p, j) => {
      const kind =
        j < 4
          ? "rush"
          : n === 2 && j < 6
            ? "blitz"
            : n === 3 && j === 4
              ? "spy"
              : n === 4 && j === 5
                ? "contain"
                : n === 0 && j < 9
                  ? "man"
                  : "zone";
      assignments[p] = {
        kind,
        target: eligible[(j - 4 + 5) % 5],
        center: { ...starts[p], y: starts[p].y + 3 + n },
        radius: 7,
      };
    });
    return {
      id: `${side}-${n + 1}`,
      side,
      name:
        side === "offense"
          ? [
              "Boundary Post",
              "Crossing Traffic",
              "Vertical Stretch",
              "Seam & Flat",
              "Levels",
            ][n]
          : [
              "Cover 1",
              "Two High",
              "Interior Heat",
              "Robber Spy",
              "Edge Contain",
            ][n],
      concept: ["Post", "Crossers", "Verticals", "Flood", "Levels"][n],
      kind: "pass",
      routes,
      reads: [eligible[n], eligible[(n + 2) % 5]],
      assignments,
      updatedAt: 0,
    };
  });
}
