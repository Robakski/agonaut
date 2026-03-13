//! # Agonaut MPC Scoring Computation
//!
//! This module defines the MPC computation that runs on secret-shared solution data.
//! It is executed by the 4 MPC nodes allocated to the contract.
//!
//! ## How it works
//!
//! Each agent's solution is a secret variable with:
//! - Secret data: The actual solution bytes (secret-shared, no node sees plaintext)
//! - Metadata: agent_id + round_id (public, used for identification)
//!
//! The scoring function evaluates each solution against the problem criteria
//! and outputs a score (0-10000 basis points) per agent.
//!
//! ## Important: Scoring Logic
//!
//! The actual scoring logic depends on the problem type. For the initial version,
//! we implement a generic scoring framework that:
//! 1. Reads all secret solution variables
//! 2. Applies a scoring function (defined per problem type)
//! 3. Returns scores as output variables
//!
//! Problem-specific scoring functions will be registered via the problem CID.
//! For v1, we support a basic "optimization score" where the solution closest
//! to an optimal value gets the highest score.

use pbc_zk::{Sbi32, secret_variable_ids, load_sbi, load_metadata};

/// Maximum score in basis points
const MAX_SCORE_BPS: i32 = 10000;

/// Main MPC computation entry point.
///
/// This function runs on secret-shared data across all MPC nodes.
/// No individual node sees any plaintext solution.
///
/// Returns: One Sbi32 per agent containing their score (0-10000 bps).
///
/// # Scoring Strategy (v1: Generic Optimization)
///
/// For v1, we implement a relative scoring model:
/// - Each solution is evaluated as a secret i32 value (the "quality metric")
/// - The best solution gets 10000 bps
/// - Other solutions are scored relative to the best
/// - Formula: score = (solution_quality * 10000) / best_quality
///
/// This will be extended with problem-specific scorers in future versions.
pub fn zk_compute() -> Vec<Sbi32> {
    let var_ids: Vec<_> = secret_variable_ids().collect();
    let num_vars = var_ids.len();

    if num_vars == 0 {
        return vec![];
    }

    // Load all solutions as secret i32 quality metrics
    let mut qualities: Vec<Sbi32> = Vec::with_capacity(num_vars);
    for &var_id in &var_ids {
        qualities.push(load_sbi::<Sbi32>(var_id));
    }

    // Find the maximum quality score (secret comparison)
    let mut best_quality = qualities[0];
    for i in 1..num_vars {
        // Secret branching: if this quality > best, update best
        let is_better = qualities[i] > best_quality;
        // Use conditional assignment (secret branch)
        if qualities[i] > best_quality {
            best_quality = qualities[i];
        }
    }

    // Score each solution relative to the best
    // score = (quality * MAX_SCORE_BPS) / best_quality
    let max_score = Sbi32::from(MAX_SCORE_BPS);
    let mut scores: Vec<Sbi32> = Vec::with_capacity(num_vars);

    for i in 0..num_vars {
        // Multiply first to maintain precision
        let numerator = qualities[i] * max_score;
        // Note: Division in MPC is expensive but necessary for relative scoring
        let score = numerator / best_quality;
        scores.push(score);
    }

    scores
}
