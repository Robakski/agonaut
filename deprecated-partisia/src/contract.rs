//! # Agonaut Scorer — Partisia MPC Smart Contract
//!
//! This contract runs on Partisia Blockchain as a second layer to Base L2.
//! It receives encrypted agent solutions, scores them via MPC computation,
//! and produces signed results that are relayed back to Base L2.
//!
//! ## Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │  Base L2 (Layer 1)                                          │
//! │  ┌─────────────┐  ┌──────────────────┐  ┌───────────────┐  │
//! │  │ BountyRound  │  │ PartisiaMpcVerifier│ │  Treasury     │  │
//! │  │ (escrow,     │  │ (verifies MPC    │  │  (fees)       │  │
//! │  │  claims)     │  │  signatures)     │  │               │  │
//! │  └─────────────┘  └──────────────────┘  └───────────────┘  │
//! │         ▲                   ▲                               │
//! │         │                   │ signed scores                 │
//! │         │                   │                               │
//! ├─────────┼───────────────────┼───────────────────────────────┤
//! │  Relayer (off-chain script) │                               │
//! │         │                   │                               │
//! ├─────────┼───────────────────┼───────────────────────────────┤
//! │  Partisia Blockchain (Layer 2)                              │
//! │  ┌─────────────────────────────────────────────────────┐    │
//! │  │  AgonautScorer (this contract)                       │    │
//! │  │  - Receives encrypted solutions from agents          │    │
//! │  │  - Scores via MPC (secret-shared, no node sees data) │    │
//! │  │  - MPC nodes sign results                            │    │
//! │  │  - Results readable by relayer                        │    │
//! │  └─────────────────────────────────────────────────────┘    │
//! └─────────────────────────────────────────────────────────────┘
//! ```
//!
//! ## Flow
//!
//! 1. Round is registered on this contract (round ID, problem CID, agent list)
//! 2. Agents submit encrypted solutions directly to this contract
//!    - Solutions are secret-shared across 4 MPC nodes
//!    - No individual node sees the plaintext solution
//! 3. Owner (or anyone after deadline) triggers MPC scoring computation
//! 4. MPC nodes compute scores on secret-shared data using the scoring function
//! 5. Results are opened and attested (signed) by MPC nodes
//! 6. Relayer reads signed results and submits to Base L2 PartisiaMpcVerifier
//! 7. After settlement on Base, sponsor can request solution release
//!
//! ## Solution Privacy
//!
//! - Solutions are NEVER visible in plaintext to any single party
//! - MPC computation operates on secret-shared fragments
//! - Only SCORES are revealed (not solutions)
//! - After settlement, solutions can be selectively released to sponsor only

#![allow(unused)]

use pbc_contract_codegen::{
    init, action, zk_on_secret_input, zk_on_compute_complete,
    zk_on_variables_opened, zk_on_attestation_complete,
};
use pbc_contract_common::context::ContractContext;
use pbc_contract_common::events::EventGroup;
use pbc_contract_common::zk::{
    SecretVarId, ZkState, ZkStateChange, AttestationId,
    ZkInputDef, ZkClosed,
};
use pbc_traits::ReadWriteState;
use read_write_state_derive::ReadWriteState;
use read_write_rpc_derive::{ReadRPC, WriteRPC};
use create_type_spec_derive::CreateTypeSpec;

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

/// Metadata attached to each secret variable (agent solution).
#[derive(ReadWriteState, ReadRPC, WriteRPC, CreateTypeSpec, Clone)]
struct SecretVarMetadata {
    /// The agent ID on Base L2 ArenaRegistry
    agent_id: u64,
    /// The round this solution belongs to
    round_id: u64,
}

/// Status of a scoring round
#[derive(ReadWriteState, ReadRPC, WriteRPC, CreateTypeSpec, Clone, PartialEq)]
#[repr(u8)]
enum RoundStatus {
    /// Accepting solutions
    Open = 0,
    /// Computing scores
    Computing = 1,
    /// Scores computed, awaiting attestation
    Attesting = 2,
    /// Complete — scores attested and available
    Complete = 3,
    /// Sponsor has claimed solutions
    SolutionsReleased = 4,
}

/// A scoring round registered from Base L2
#[derive(ReadWriteState, ReadRPC, WriteRPC, CreateTypeSpec, Clone)]
struct ScoringRound {
    /// Unique round identifier (matches BountyRound on Base)
    round_id: u64,
    /// IPFS CID of the problem dataset (bytes32 from Base)
    problem_cid: Vec<u8>,
    /// Number of solutions submitted so far
    solution_count: u32,
    /// Maximum solutions accepted (0 = unlimited)
    max_solutions: u32,
    /// Deadline timestamp (Unix seconds) — after this, computation can start
    deadline: u64,
    /// Current status
    status: RoundStatus,
    /// Base L2 address of the sponsor (for solution release authorization)
    sponsor_address: Vec<u8>,
}

/// Computed score for one agent
#[derive(ReadWriteState, ReadRPC, WriteRPC, CreateTypeSpec, Clone)]
struct AgentScore {
    agent_id: u64,
    /// Score in basis points (0-10000)
    score: u32,
}

/// Result of a completed scoring round
#[derive(ReadWriteState, ReadRPC, WriteRPC, CreateTypeSpec, Clone)]
struct ScoringResult {
    round_id: u64,
    scores: Vec<AgentScore>,
    /// Proof string (MPC node signatures in EVM-compatible format)
    proof: Option<String>,
}

/// Contract state
#[derive(ReadWriteState, ReadRPC, WriteRPC, CreateTypeSpec, Clone)]
struct ContractState {
    /// Contract owner (can register rounds and trigger computation)
    owner: Vec<u8>,
    /// All registered scoring rounds
    rounds: Vec<ScoringRound>,
    /// Completed scoring results
    results: Vec<ScoringResult>,
    /// Auto-incrementing round counter
    next_round_id: u64,
}

// ═══════════════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════════

/// Initialize the contract with an owner address.
#[init(zk = true)]
fn initialize(
    context: ContractContext,
    _zk_state: ZkState<SecretVarMetadata>,
) -> ContractState {
    ContractState {
        owner: context.sender.to_vec(),
        rounds: vec![],
        results: vec![],
        next_round_id: 1,
    }
}

// ═══════════════════════════════════════════════════════════════
//  PUBLIC ACTIONS
// ═══════════════════════════════════════════════════════════════

/// Register a new scoring round. Called by the relayer when a BountyRound
/// on Base L2 enters the COMMIT phase.
///
/// # Arguments
/// * `problem_cid` - IPFS CID of the problem dataset (32 bytes)
/// * `max_solutions` - Maximum number of solutions to accept
/// * `deadline` - Unix timestamp after which computation can be triggered
/// * `sponsor_address` - Base L2 address of the sponsor (20 bytes)
#[action(shortname = 0x01, zk = true)]
fn register_round(
    context: ContractContext,
    mut state: ContractState,
    _zk_state: ZkState<SecretVarMetadata>,
    problem_cid: Vec<u8>,
    max_solutions: u32,
    deadline: u64,
    sponsor_address: Vec<u8>,
) -> (ContractState, Vec<EventGroup>, Vec<ZkStateChange>) {
    // Only owner can register rounds
    assert_eq!(context.sender.to_vec(), state.owner, "Only owner can register rounds");

    let round_id = state.next_round_id;
    state.next_round_id += 1;

    state.rounds.push(ScoringRound {
        round_id,
        problem_cid,
        solution_count: 0,
        max_solutions,
        deadline,
        status: RoundStatus::Open,
        sponsor_address,
    });

    (state, vec![], vec![])
}

/// Submit an encrypted solution for a specific round.
/// The solution data is secret-shared across MPC nodes — no single node
/// sees the plaintext.
///
/// # Arguments
/// * `round_id` - The round to submit a solution for
/// * `agent_id` - The agent's ID on Base L2 ArenaRegistry
#[zk_on_secret_input(shortname = 0x10)]
fn submit_solution(
    context: ContractContext,
    mut state: ContractState,
    zk_state: ZkState<SecretVarMetadata>,
    round_id: u64,
    agent_id: u64,
) -> (
    ContractState,
    Vec<EventGroup>,
    ZkInputDef<SecretVarMetadata, ZkClosed>,
) {
    // Find the round
    let round = state.rounds.iter_mut()
        .find(|r| r.round_id == round_id)
        .expect("Round not found");

    // Check round is open
    assert_eq!(round.status, RoundStatus::Open, "Round not accepting solutions");

    // Check max solutions not exceeded
    if round.max_solutions > 0 {
        assert!(round.solution_count < round.max_solutions, "Max solutions reached");
    }

    round.solution_count += 1;

    // Accept the secret input with metadata tagging it to this agent/round
    let input_def = ZkInputDef {
        seal: false,
        metadata: SecretVarMetadata { agent_id, round_id },
        expected_bit_lengths: None,
    };

    (state, vec![], input_def)
}

/// Trigger MPC scoring computation for a round.
/// Can be called by anyone after the deadline has passed.
///
/// # Arguments
/// * `round_id` - The round to compute scores for
#[action(shortname = 0x02, zk = true)]
fn start_computation(
    context: ContractContext,
    mut state: ContractState,
    zk_state: ZkState<SecretVarMetadata>,
    round_id: u64,
) -> (ContractState, Vec<EventGroup>, Vec<ZkStateChange>) {
    let round = state.rounds.iter_mut()
        .find(|r| r.round_id == round_id)
        .expect("Round not found");

    assert_eq!(round.status, RoundStatus::Open, "Round not in Open status");
    assert!(round.solution_count > 0, "No solutions submitted");

    // After deadline, anyone can trigger. Before deadline, only owner.
    if context.block_production_time < round.deadline {
        assert_eq!(context.sender.to_vec(), state.owner, "Only owner before deadline");
    }

    round.status = RoundStatus::Computing;

    // Start the MPC computation
    (state, vec![], vec![ZkStateChange::start_computation()])
}

// ═══════════════════════════════════════════════════════════════
//  MPC COMPUTATION CALLBACKS
// ═══════════════════════════════════════════════════════════════

/// Called when MPC computation completes.
/// Opens the result variables so they can be read and attested.
#[zk_on_compute_complete]
fn on_compute_complete(
    _context: ContractContext,
    state: ContractState,
    _zk_state: ZkState<SecretVarMetadata>,
    output_variables: Vec<SecretVarId>,
) -> (ContractState, Vec<EventGroup>, Vec<ZkStateChange>) {
    // Open all output variables (scores)
    let opens: Vec<ZkStateChange> = output_variables.iter()
        .map(|&var_id| ZkStateChange::OpenVariables { variables: vec![var_id] })
        .collect();

    (state, vec![], opens)
}

/// Called when output variables are opened (scores become readable).
/// Builds the scoring result and requests attestation from MPC nodes.
#[zk_on_variables_opened]
fn on_variables_opened(
    _context: ContractContext,
    mut state: ContractState,
    zk_state: ZkState<SecretVarMetadata>,
    opened_variables: Vec<SecretVarId>,
) -> (ContractState, Vec<EventGroup>, Vec<ZkStateChange>) {
    // Build scores from opened variables
    // Each opened variable contains an agent_id (from metadata) and a score
    let mut scores: Vec<AgentScore> = Vec::new();

    for &var_id in &opened_variables {
        if let Some(variable) = zk_state.get_variable(var_id) {
            let metadata = &variable.metadata;
            // The opened value is the score (u32, 0-10000 bps)
            let score_value: u32 = variable.open_value().unwrap_or(0);
            scores.push(AgentScore {
                agent_id: metadata.agent_id,
                score: score_value,
            });
        }
    }

    // Find which round this belongs to (use first score's metadata)
    let round_id = if let Some(first_var) = opened_variables.first() {
        zk_state.get_variable(*first_var)
            .map(|v| v.metadata.round_id)
            .unwrap_or(0)
    } else {
        0
    };

    // Update round status
    if let Some(round) = state.rounds.iter_mut().find(|r| r.round_id == round_id) {
        round.status = RoundStatus::Attesting;
    }

    // Store preliminary result (without proof yet)
    let result = ScoringResult {
        round_id,
        scores: scores.clone(),
        proof: None,
    };
    state.results.push(result);

    // Serialize scores for attestation in big-endian format
    // Format: [round_id (8 bytes)] [n_scores (4 bytes)] [agent_id (8 bytes) + score (4 bytes)] ...
    // This MUST match the format expected by PartisiaMpcVerifier on Base L2
    let data_to_attest = serialize_scores_for_evm(round_id, &scores);

    (
        state,
        vec![],
        vec![ZkStateChange::Attest { data_to_attest }],
    )
}

/// Called when MPC nodes have signed (attested) the result.
/// Stores the signatures in EVM-compatible format for the relayer.
#[zk_on_attestation_complete]
fn on_attestation_complete(
    _context: ContractContext,
    mut state: ContractState,
    zk_state: ZkState<SecretVarMetadata>,
    attestation_id: AttestationId,
) -> (ContractState, Vec<EventGroup>, Vec<ZkStateChange>) {
    // Get the attestation with signatures
    let attestation = zk_state.get_attestation(attestation_id)
        .expect("Attestation not found");

    // Convert signatures to EVM-compatible hex format
    // Ethereum expects recovery_id to be 0x1B or 0x1C (add 27 to PBC's 0x00/0x01)
    let proof: String = format!(
        "[{}]",
        attestation.signatures.iter()
            .map(|sig| {
                let recovery_id = sig.recovery_id + 27;
                let r_hex: String = sig.value_r.iter()
                    .map(|b| format!("{b:02x}"))
                    .collect();
                let s_hex: String = sig.value_s.iter()
                    .map(|b| format!("{b:02x}"))
                    .collect();
                format!("0x{r_hex}{s_hex}{recovery_id:02x}")
            })
            .collect::<Vec<String>>()
            .join(", ")
    );

    // Find the most recent result and attach the proof
    if let Some(result) = state.results.last_mut() {
        result.proof = Some(proof);

        // Update round status to Complete
        if let Some(round) = state.rounds.iter_mut().find(|r| r.round_id == result.round_id) {
            round.status = RoundStatus::Complete;
        }
    }

    // Delete all secret variables (solutions) — they're no longer needed for computation
    // Note: For sponsor solution release, we'd keep them until released
    let variables_to_delete: Vec<SecretVarId> = zk_state.secret_variables()
        .filter(|(_, v)| v.metadata.round_id == state.results.last().map(|r| r.round_id).unwrap_or(0))
        .map(|(id, _)| id)
        .collect();

    (
        state,
        vec![],
        vec![ZkStateChange::OutputComplete { variables_to_delete }],
    )
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

/// Serialize scores in big-endian format matching PartisiaMpcVerifier's expected encoding.
///
/// Format:
/// - round_id: u64 (8 bytes, big-endian)
/// - n_scores: u32 (4 bytes, big-endian)
/// - For each score:
///   - agent_id: u64 (8 bytes, big-endian)
///   - score: u32 (4 bytes, big-endian)
fn serialize_scores_for_evm(round_id: u64, scores: &[AgentScore]) -> Vec<u8> {
    let mut output: Vec<u8> = Vec::new();

    // Round ID
    output.extend_from_slice(&round_id.to_be_bytes());

    // Number of scores
    output.extend_from_slice(&(scores.len() as u32).to_be_bytes());

    // Each score
    for score in scores {
        output.extend_from_slice(&score.agent_id.to_be_bytes());
        output.extend_from_slice(&score.score.to_be_bytes());
    }

    output
}
