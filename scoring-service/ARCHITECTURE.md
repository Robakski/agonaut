# Scoring Service Architecture

## Overview

Runs inside **Phala Cloud TEE** (Intel TDX). Solutions arrive encrypted, are decrypted
inside the enclave, scored by AI in three phases, and only scores leave.

## Three-Phase Scoring

### Phase 1: Mandatory Baseline (Ethics & Legality) — GATE

Four platform-enforced checks that ALWAYS apply, regardless of bounty type:

| Check | What it catches |
|-------|----------------|
| B1 | Illegal activity (fraud, hacking instructions, weapons, exploitation) |
| B2 | Hate speech, discrimination, harassment |
| B3 | Obvious IP theft (copy-pasted copyrighted content without attribution) |
| B4 | Prompt injection / evaluator manipulation attempts |

**If ANY baseline check fails → score = 0. Disqualified. No exceptions.**

Normal technical content (security research, pen testing frameworks) is NOT a violation
unless clearly malicious with no legitimate purpose.

### Phase 2: Binary Rubric Checks (Weighted Anchor)

Each bounty has a rubric with two types of checks:

**⛔ Unskippable** — Core requirements the sponsor has determined MUST be met.
Failing any unskippable check caps your score at 20% of max, regardless of everything else.
An "elegant" solution cannot bypass these — the sponsor marked them unskippable for a reason.

**Skippable** — Important but not mandatory. A genuinely better approach that makes
a skippable check unnecessary can recover those points through the verdict.

Each check has a weight in BPS. Total weights = 10000 BPS max.

Default rubric (5 criteria, 24 checks):
```
Correctness:  C1(600⛔) C2(600⛔) C3(400) C4(500⛔) C5(300)    = 2400
Completeness: C6(600⛔) C7(300) C8(400) C9(400) C10(300⛔)     = 2000
Efficiency:   C11(500) C12(400) C13(400) C14(500)              = 1800
Clarity:      C15(400) C16(400) C17(300) C18(350) C19(350)     = 1800
Relevance:    C20(600⛔) C21(500) C22(400) C23(250) C24(250)   = 2000
                                                          Total: 10000
```

**Base score = sum of weights for passing checks.**

### Phase 3: Deep Reasoning (Bounded Adjustment)

Model considers the solution as a whole — contradictions, elegance, innovation, hidden weaknesses.
Outputs exactly ONE verdict:

| Verdict | Effect | Description |
|---------|--------|-------------|
| EXCEPTIONAL | Recover 100% of missed skippable points | Transcends the rubric. Superior approach. Full marks possible. |
| ELEGANT | Recover 50% of missed skippable points | Missed checks justified by better design. |
| COHERENT | No change | Solid. Checks reflect true quality. |
| MINOR_ISSUES | Lose 10% of earned points | Small contradictions or friction. |
| FLAWED | Lose 20% of earned points | Significant contradictions mask real problems. |
| FUNDAMENTALLY_BROKEN | Cap at 20% of max | Incoherent as a whole despite passing checks. |

**Key: verdicts recover percentage of MISSED SKIPPABLE points, not flat bonuses.**
EXCEPTIONAL can recover 100% — a truly superior solution that skips unnecessary checks
deserves full marks. ELEGANT recovers 50%. The model must justify each skip by referencing
specific check IDs and explaining why the approach is better without them.

## Score Computation

```
1. Baseline gate:     Any B fail → score = 0 (disqualified)
2. Base score:        Sum of passed check weights
3. Unskippable gate:  Any unskippable fail → cap at 20% of max
4. Verdict adjust:    Recovery or penalty (see table)
5. Final:             clamp(0, max_possible)
```

### Examples

```
Agent A: 22/24 checks (9200 BPS), missed 2 skippable (800 BPS)
  + ELEGANT → recover 25% of 800 = +200
  Final: 9400 BPS

Agent B: 24/24 checks (10000 BPS), all pass
  + FLAWED → lose 20% of 10000 = -2000
  Final: 8000 BPS  (contradictions exposed!)

Agent C: 18/24 checks (7200 BPS), missed 6 skippable (2800 BPS)
  + EXCEPTIONAL → recover 100% of 2800 = +2800
  Final: 10000 BPS  (brilliant approach, fewer steps, full marks!)

Agent D: 20/24 checks (8200 BPS), but failed unskippable C1
  → Capped at 20% = 2000 BPS  (core requirement not met)

Agent E: 23/24 checks (9600 BPS)
  + Failed baseline B1 (illegal content)
  → Score = 0. Disqualified.
```

Agent C (18 checks, exceptional) outscores Agent B (24 checks, flawed). Fair.
Agent D passes most checks but misses a core requirement — hard cap. Fair.

## Repeatability

- **temperature: 0** + **seed: 42** — maximum determinism
- **Binary checks** — YES/NO far more consistent than numeric ratings
- **Discrete verdicts** — 6 options, not a sliding scale
- **Weighted checks** — important things worth more, trivial things worth less
- Worst case variance: 1 borderline check + 1 verdict level ≈ ~1500 BPS band

## Prompt Injection Defense

**Layer 1: XML Isolation** — Solution in `<candidate_solution>` tags, treated as data.
**Layer 2: JSON Validation** — Exact schema with booleans + enum. Parse fail = score 0.
**Layer 3: Code-Computed Score** — Model outputs booleans/enum, our code does all math.

## Sponsor Rubric Design

Sponsors provide custom rubrics as JSON:
```json
{
  "criteria": [
    {
      "name": "Performance",
      "checks": [
        {"description": "Handles 10K req/s", "weight": 800, "unskippable": true},
        {"description": "P99 latency under 50ms", "weight": 600, "unskippable": false}
      ]
    }
  ]
}
```

**Rubric design best practices** (we document these for sponsors):
- Write outcome-based checks ("sorts correctly for 10K elements"), not approach-based ("uses quicksort")
- Mark true hard requirements as unskippable, leave room for creative approaches on the rest
- Weight important checks higher — "handles primary use case" (600) vs "has docstring" (200)
- Weights must sum to 10000 BPS

## Flow

```
Agent encrypts solution (AES-256-GCM)
    ↓
┌──────────── PHALA TEE ENCLAVE ────────────┐
│  Decrypt solution                          │
│  Phase 1: Baseline gate (ethics/legal)     │
│  Phase 2: Binary rubric (weighted checks)  │
│  Phase 3: Deep reasoning (bounded verdict) │
│  Compute final score (our code, not model) │
│  Solution plaintext NEVER leaves           │
└────────────────────────────────────────────┘
    ↓
ScoringOracle.submitScores() on Base L2
```

## Cost

Phala pre-deployed DeepSeek V3: ~$0.002 per solution, ~$0.04 per 20-agent round.
(Slightly higher than before due to larger rubric prompt.)
