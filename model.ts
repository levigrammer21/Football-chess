export const VERSION = "1.0.0";
export type Point = { x: number; y: number };
export const eligible = ["WR1", "WR2", "WR3", "TE", "RB"] as const;
export type Receiver = (typeof eligible)[number];
export const offensePositions = [
  "QB",
  "LT",
  "LG",
  "C",
  "RG",
  "RT",
  ...eligible,
];
export const defensePositions = [
  "LE",
  "DT1",
  "DT2",
  "RE",
  "LB1",
  "LB2",
  "CB1",
  "CB2",
  "NB",
  "FS",
  "SS",
];
export const starts: Record<string, Point> = {
  QB: { x: 26.5, y: -5 },
  LT: { x: 22, y: 0 },
  LG: { x: 24, y: 0 },
  C: { x: 26.5, y: 0 },
  RG: { x: 29, y: 0 },
  RT: { x: 31, y: 0 },
  WR1: { x: 5, y: 0 },
  WR2: { x: 47, y: 0 },
  WR3: { x: 39, y: -1 },
  TE: { x: 34, y: 0 },
  RB: { x: 23, y: -7 },
  LE: { x: 21, y: 1 },
  DT1: { x: 25, y: 1 },
  DT2: { x: 28, y: 1 },
  RE: { x: 32, y: 1 },
  LB1: { x: 23, y: 6 },
  LB2: { x: 32, y: 6 },
  CB1: { x: 6, y: 4 },
  CB2: { x: 46, y: 4 },
  NB: { x: 39, y: 5 },
  FS: { x: 18, y: 17 },
  SS: { x: 35, y: 15 },
};
export type Rating =
  | "accuracy"
  | "arm"
  | "awareness"
  | "decision"
  | "mobility"
  | "pressure"
  | "speed"
  | "acceleration"
  | "route"
  | "release"
  | "hands"
  | "traffic"
  | "vision"
  | "elusiveness"
  | "receiving"
  | "blocking"
  | "man"
  | "zone"
  | "reaction"
  | "ball"
  | "tackling"
  | "coverage"
  | "recognition"
  | "rush"
  | "pursuit"
  | "strength"
  | "shedding"
  | "kicking";
export type Athlete = {
  id: string;
  name: string;
  position: string;
  ratings: Record<Rating, number>;
  overall: number;
};
export type Assignment = {
  kind: "man" | "zone" | "blitz" | "rush" | "spy" | "contain";
  target: Receiver;
  center: Point;
  radius: number;
};
export type Play = {
  id: string;
  name: string;
  side: "offense" | "defense";
  concept: string;
  kind: "pass" | "run";
  routes: Record<Receiver, Point[]>;
  reads: [Receiver, Receiver];
  assignments: Record<string, Assignment>;
  updatedAt: number;
};
export type Profile = {
  uid: string;
  name: string;
  teamName: string;
  roster: Athlete[];
  createdAt: number;
  activeGames: number;
};
export type Mentality = "conservative" | "balanced" | "aggressive";
export type Call = {
  playId: string;
  mentality: Mentality;
  action: "play" | "punt" | "fieldGoal" | "extraPoint" | "twoPoint";
  turn: number;
};
export type Frame = {
  t: number;
  players: Record<string, Point>;
  ball: Point;
  event: string;
};
export type Outcome =
  | "complete"
  | "incomplete"
  | "interception"
  | "sack"
  | "scramble"
  | "run"
  | "punt"
  | "fieldGoal"
  | "missedFieldGoal"
  | "extraPoint"
  | "missedExtraPoint"
  | "fumble";
export type Snap = {
  turn: number;
  offense: number;
  quarter: number;
  clock: number;
  down: number;
  distance: number;
  spot: number;
  drive: number;
  outcome: Outcome;
  yards: number;
  td: boolean;
  safety: boolean;
  conversion: boolean;
  points: number;
  target: Receiver | null;
  read: number;
  timeToThrow: number;
  pressure: boolean;
  separation: number;
  contested: boolean;
  drop: boolean;
  coverageDefender: string | null;
  defender: string | null;
  missedTackles: string[];
  pressurers: string[];
  frames: Frame[];
  reasons: string[];
  duration: number;
  coverage: string;
  concept: string;
  offPlayId: string;
  defPlayId: string;
  offPlayName: string;
  defPlayName: string;
};
export type Game = {
  id: string;
  members: string[];
  names: string[];
  status: "waiting" | "active" | "complete";
  score: number[];
  possession: number;
  quarter: number;
  clock: number;
  down: number;
  distance: number;
  spot: number;
  drive: number;
  turn: number;
  phase: "scrimmage" | "conversion";
  locks: string[];
  deadline: number;
  createdAt: number;
  endedAt: number;
  winner: string | null;
  lastSummary: string;
  otPossessions: number;
  misses: number[];
};
export type SnapPublic = Omit<
  Snap,
  | "coverage"
  | "concept"
  | "offPlayId"
  | "defPlayId"
  | "offPlayName"
  | "defPlayName"
  | "read"
>;
export type GamePlan = { plays: Play[]; roster: Athlete[] };
export type Metric = {
  calls: number;
  yards: number;
  success: number;
  attempts: number;
  completions: number;
  td: number;
  int: number;
  sacks: number;
  pressure: number;
  explosive: number;
  primaryTargets: number;
  secondaryTargets: number;
  primarySuccess: number;
  secondarySuccess: number;
  throwTime: number;
  throws: number;
  turnovers: number;
};
export type PlayerStat = {
  snaps: number;
  attempts: number;
  completions: number;
  yards: number;
  td: number;
  int: number;
  sacks: number;
  pressures: number;
  targets: number;
  receptions: number;
  drops: number;
  separation: number;
  contested: number;
  tackles: number;
  missedTackles: number;
  breakups: number;
  primary: number;
  secondary: number;
  decisionTime: number;
};
export type PlayStat = {
  name: string;
  side: string;
  total: Metric;
  splits: Record<string, Metric>;
};
export type Analytics = {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  plays: Record<string, PlayStat>;
  players: Record<string, PlayerStat>;
  team: Metric;
};
