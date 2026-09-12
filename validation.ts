import { z } from "zod";
import { defensePositions, eligible, Play } from "./model";
const point = z
  .object({
    x: z.number().finite().min(0).max(53.3),
    y: z.number().finite().min(-10).max(60),
  })
  .strict();
const receiver = z.enum(eligible);
const assignment = z
  .object({
    kind: z.enum(["man", "zone", "blitz", "rush", "spy", "contain"]),
    target: receiver,
    center: point,
    radius: z.number().min(3).max(15),
  })
  .strict();
export const playSchema = z
  .object({
    id: z.string().regex(/^(offense|defense)-[1-5]$/),
    name: z.string().trim().min(2).max(36),
    side: z.enum(["offense", "defense"]),
    concept: z.string().trim().min(1).max(28),
    kind: z.enum(["pass", "run"]),
    routes: z.record(z.array(point).min(2).max(64)),
    reads: z
      .tuple([receiver, receiver])
      .refine((x) => x[0] !== x[1], "Choose two different reads"),
    assignments: z.record(assignment),
    updatedAt: z.number().finite(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (!p.id.startsWith(p.side))
      ctx.addIssue({ code: "custom", message: "Invalid slot" });
    if (Object.keys(p.routes).sort().join() !== [...eligible].sort().join())
      ctx.addIssue({ code: "custom", message: "All five routes required" });
    if (
      Object.keys(p.assignments).sort().join() !==
      [...defensePositions].sort().join()
    )
      ctx.addIssue({
        code: "custom",
        message: "All eleven defenders required",
      });
  });
export function validatePlay(p: unknown): Play {
  return playSchema.parse(p) as Play;
}
export const idSchema = z.string().regex(/^[A-Z0-9]{12}$/);
export const callSchema = z
  .object({
    playId: z.string().regex(/^(offense|defense)-[1-5]$/),
    mentality: z.enum(["conservative", "balanced", "aggressive"]),
    action: z.enum(["play", "punt", "fieldGoal", "extraPoint", "twoPoint"]),
    turn: z.number().int().min(0),
  })
  .strict();
