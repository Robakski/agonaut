"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import { usePathname } from "@/i18n/navigation";
import { API_URL } from "@/lib/contracts";

/**
 * Activity tracker for airdrop eligibility.
 *
 * Automatically tracks:
 * - Wallet connect/disconnect + session duration
 * - Page views (with dedup)
 * - Exposes `trackEvent()` for manual events (bounty_created, solution_submit, etc.)
 *
 * Usage: call useActivityTracker() once in a layout or provider component.
 */

function generateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function sendEvent(payload: {
  wallet: string;
  event: string;
  detail?: string;
  page?: string;
  session_id?: string;
  amount_wei?: string;
}) {
  try {
    await fetch(`${API_URL}/activity/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Fire and forget — don't block UI
    });
  } catch {
    // Silent fail — tracking should never break UX
  }
}

export function useActivityTracker() {
  const { address, isConnected } = useAccount();
  const pathname = usePathname();
  const sessionIdRef = useRef<string>("");
  const connectTimeRef = useRef<number>(0);
  const lastPageRef = useRef<string>("");
  const wasConnectedRef = useRef(false);

  // Track wallet connect
  useEffect(() => {
    if (isConnected && address && !wasConnectedRef.current) {
      wasConnectedRef.current = true;
      sessionIdRef.current = generateSessionId();
      connectTimeRef.current = Date.now();
      sendEvent({
        wallet: address,
        event: "connect",
        session_id: sessionIdRef.current,
      });
    }

    if (!isConnected && wasConnectedRef.current && address) {
      // Disconnect — log session duration
      const duration = Math.round((Date.now() - connectTimeRef.current) / 1000);
      sendEvent({
        wallet: address,
        event: "disconnect",
        detail: String(duration),
        session_id: sessionIdRef.current,
      });
      wasConnectedRef.current = false;
    }
  }, [isConnected, address]);

  // Track page views (deduped)
  useEffect(() => {
    if (!isConnected || !address || pathname === lastPageRef.current) return;
    lastPageRef.current = pathname;
    sendEvent({
      wallet: address,
      event: "page_view",
      page: pathname,
      session_id: sessionIdRef.current,
    });
  }, [pathname, isConnected, address]);

  // Send disconnect on tab close
  useEffect(() => {
    if (!isConnected || !address) return;
    const handleUnload = () => {
      const duration = Math.round((Date.now() - connectTimeRef.current) / 1000);
      // navigator.sendBeacon for reliable delivery on close
      navigator.sendBeacon(
        `${API_URL}/activity/track`,
        JSON.stringify({
          wallet: address,
          event: "disconnect",
          detail: String(duration),
          session_id: sessionIdRef.current,
        })
      );
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [isConnected, address]);

  // Manual event tracking
  const trackEvent = useCallback(
    (event: string, detail?: string, amountWei?: string) => {
      if (!address) return;
      sendEvent({
        wallet: address,
        event,
        detail,
        session_id: sessionIdRef.current,
        page: pathname,
        amount_wei: amountWei,
      });
    },
    [address, pathname]
  );

  return { trackEvent };
}
