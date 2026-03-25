/**
 * API client for the Agonaut backend.
 */

import { API_URL } from "./contracts";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  return res.json();
}

// ── Bounty Creation (relay to operator) ──

export interface CreateBountyRequest {
  title: string;
  description: string;
  tags: string[];
  bountyEth: string;
  commitHours: number;
  maxAgents: number;
  threshold: number;
  graduated: boolean;
  rubric: {
    criteria: {
      name: string;
      checks: { description: string; weight: number; required: boolean }[];
    }[];
  };
  sponsorAddress: string;
  isPrivate?: boolean;
}

export interface CreateBountyResponse {
  bountyId: number;
  roundAddress: string;
  problemCid: string;
  status: "pending_deposit";
  createTxHash: string;
  spawnTxHash: string;
}

export async function createBountyRelay(data: CreateBountyRequest): Promise<CreateBountyResponse> {
  return fetchApi<CreateBountyResponse>("/bounties/create", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Bounties ──

export async function listBounties(phase?: string, limit = 20, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (phase) params.set("phase", phase);
  return fetchApi<any[]>(`/bounties/?${params}`);
}

export async function getBounty(id: number) {
  return fetchApi<any>(`/bounties/${id}`);
}

export async function getRubric(id: number) {
  return fetchApi<any[]>(`/bounties/${id}/rubric`);
}

export async function getResults(id: number) {
  return fetchApi<any[]>(`/bounties/${id}/results`);
}

// ── Agents ──

export async function getAgent(id: number) {
  return fetchApi<any>(`/agents/${id}`);
}

export async function getLeaderboard(limit = 50) {
  return fetchApi<any[]>(`/agents/leaderboard?limit=${limit}`);
}

export async function searchAgents(q: string) {
  return fetchApi<any[]>(`/agents/search?q=${encodeURIComponent(q)}`);
}

// ── Solutions ──

export async function submitSolution(data: {
  round_address: string;
  agent_id: number;
  commit_hash: string;
  encrypted_solution: string;
  agent_address: string;
}) {
  return fetchApi<any>("/solutions/submit", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getScoringStatus(roundAddress: string) {
  return fetchApi<any>(`/solutions/scoring/${roundAddress}`);
}

// ── Compliance ──

export async function screenWallet(address: string) {
  return fetchApi<any>("/compliance/screen", {
    method: "POST",
    body: JSON.stringify({ address, action: "check" }),
  });
}

export async function getKycStatus(address: string) {
  return fetchApi<any>(`/compliance/kyc/${address}`);
}

export async function getBlockedJurisdictions() {
  return fetchApi<any>("/compliance/blocked-jurisdictions");
}

/**
 * Record an on-chain transaction for compliance monitoring.
 * Fire-and-forget — never blocks UX.
 */
export function recordTransaction(
  wallet: string,
  txType: "bounty_deposit" | "entry_fee" | "registration_fee" | "prize_payout" | "bounty_refund",
  amountEth: number,
  txHash?: string,
  roundAddress?: string,
  metadata?: Record<string, unknown>,
) {
  fetch(`${API_URL}/compliance/record-tx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet,
      tx_type: txType,
      amount_eth: amountEth,
      tx_hash: txHash,
      round_address: roundAddress,
      metadata,
    }),
  }).catch(() => {}); // fire-and-forget
}

// ── Protocol ──

export async function getProtocolInfo() {
  return fetchApi<any>("/protocol");
}

// ── Activity Tracking ──

export async function trackActivity(
  wallet: string,
  event: string,
  detail?: string,
  amountWei?: string
) {
  try {
    await fetch(`${API_URL}/activity/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: wallet.toLowerCase(),
        event,
        detail,
        amount_wei: amountWei,
      }),
    });
  } catch {
    // Silent — tracking never blocks UX
  }
}
