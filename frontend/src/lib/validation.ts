/**
 * Runtime validation for API requests.
 * Defense-in-depth — validates client-side before sending to backend.
 */

import { z } from "zod";

export const CreateBountySchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(120),
  description: z.string().min(20, "Description must be at least 20 characters").max(5000),
  tags: z.array(z.string()).max(5).default([]),
  bountyEth: z.string().refine(
    (val) => {
      const n = parseFloat(val);
      return !isNaN(n) && n >= 0.009 && n <= 1000;
    },
    "Bounty must be between 0.009 and 1000 ETH"
  ),
  commitHours: z.number().int().min(1).max(168),
  maxAgents: z.number().int().min(0).max(50),
  threshold: z.number().int().min(1000).max(9500),
  graduated: z.boolean().default(true),
  rubric: z.object({
    criteria: z.array(
      z.object({
        name: z.string().min(1),
        checks: z.array(
          z.object({
            description: z.string().min(1),
            weight: z.number().int().min(0).max(10000),
            required: z.boolean().optional(),
          })
        ),
      })
    ),
  }).refine(
    (rubric) => {
      const total = rubric.criteria.reduce(
        (sum, c) => sum + c.checks.reduce((s, ch) => s + ch.weight, 0),
        0
      );
      return total === 10000;
    },
    "Rubric weights must sum to exactly 10000 (100%)"
  ),
  sponsorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
});

export type ValidatedCreateBounty = z.infer<typeof CreateBountySchema>;

/**
 * Validate bounty creation payload. Throws descriptive error if invalid.
 */
export function validateCreateBounty(data: unknown): ValidatedCreateBounty {
  return CreateBountySchema.parse(data);
}
