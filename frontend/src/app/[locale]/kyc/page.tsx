"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { Link } from "@/i18n/navigation";
import { API_URL } from "@/lib/contracts";
import SumsubWebSdk from "@sumsub/websdk-react";

/* ─── Types ─── */
type KycStatus = "NONE" | "PENDING" | "VERIFIED" | "REJECTED" | "loading";

export default function KycPage() {
  const t = useTranslations("kyc");
  const { isConnected, address: walletAddress } = useAccount();
  const [status, setStatus] = useState<KycStatus>("loading");
  const [sumsubConfigured, setSumsubConfigured] = useState<boolean | null>(null);
  const [sumsubToken, setSumsubToken] = useState<string | null>(null);
  const [sdkLaunched, setSdkLaunched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const address = walletAddress;

  // Check Sumsub configuration
  useEffect(() => {
    fetch(`${API_URL}/kyc/sumsub/configured`)
      .then(r => r.json())
      .then(d => setSumsubConfigured(d.configured ?? true))
      .catch(() => setSumsubConfigured(true));
  }, []);

  // Check KYC status
  useEffect(() => {
    if (!address) return;
    setStatus("loading");
    fetch(`${API_URL}/kyc/status?wallet=${address}`)
      .then(r => r.json())
      .then(d => setStatus(d.status || "NONE"))
      .catch(() => setStatus("NONE"));
  }, [address]);

  // Get Sumsub access token
  const getToken = useCallback(async (): Promise<string> => {
    const res = await fetch(`${API_URL}/kyc/sumsub/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: address }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to get verification token");
    }
    const { token } = await res.json();
    return token;
  }, [address]);

  // Launch Sumsub
  const launchSumsub = useCallback(async () => {
    if (!address || sdkLaunched) return;
    setError(null);
    try {
      const token = await getToken();
      setSumsubToken(token);
      setSdkLaunched(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start verification";
      setError(message);
      // Fall back to manual form on any error
      setSumsubConfigured(false);
    }
  }, [address, sdkLaunched, getToken]);

  // Token refresh handler for Sumsub SDK
  const handleTokenExpired = useCallback(async (): Promise<string> => {
    try {
      return await getToken();
    } catch {
      return "";
    }
  }, [getToken]);

  // Sumsub event handlers
  const handleSumsubMessage = useCallback((type: string) => {
    if (type === "idCheck.onApplicantStatusChanged") {
      // Re-check KYC status
      if (address) {
        fetch(`${API_URL}/kyc/status?wallet=${address}`)
          .then(r => r.json())
          .then(d => setStatus(d.status || "NONE"))
          .catch(() => {});
      }
    }
  }, [address]);

  const handleSumsubError = useCallback((error: unknown) => {
    console.error("Sumsub error:", error);
    setError("Verification widget failed to load. Switching to manual form.");
    setSdkLaunched(false);
    setSumsubToken(null);
    setSumsubConfigured(false);
  }, []);

  /* ─── Not connected ─── */
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">{t("connectTitle")}</h3>
          <p className="text-slate-500 mb-6">{t("connectDesc")}</p>
          <ConnectKitButton />
        </div>
      </div>
    );
  }

  /* ─── Already verified ─── */
  if (status === "VERIFIED") {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center py-16 bg-white border border-emerald-200 rounded-2xl shadow-sm">
          <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-2">{t("verifiedTitle")}</h3>
          <p className="text-slate-500 mb-8">{t("verifiedDesc")}</p>
          <Link
            href="/bounties/create"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all"
          >
            {t("createBounty")}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </div>
    );
  }

  /* ─── Pending review ─── */
  if (status === "PENDING") {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center py-16 bg-white border border-amber-200 rounded-2xl shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-amber-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">{t("pendingTitle")}</h3>
          <p className="text-slate-500 mb-2 max-w-md mx-auto">{t("pendingDesc")}</p>
          <p className="text-xs text-slate-400">{t("pendingHint")}</p>
        </div>
      </div>
    );
  }

  /* ─── Loading ─── */
  if (status === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center py-16">
          <div className="w-10 h-10 border-2 border-slate-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-400">{t("loading")}</p>
        </div>
      </div>
    );
  }

  /* ─── Verification form (NONE or REJECTED) ─── */
  const isRejected = status === "REJECTED";

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
          {isRejected ? t("rejectedTitle") : t("title")}
        </h1>
        <p className="text-slate-500 max-w-lg mx-auto">
          {isRejected ? t("rejectedDesc") : t("desc")}
        </p>
      </div>

      {/* Rejected banner */}
      {isRejected && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-red-800">{t("rejectedBanner")}</p>
              <p className="text-xs text-red-600 mt-1">{t("rejectedBannerDesc")}</p>
            </div>
          </div>
        </div>
      )}

      {/* Verification card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-8">
        {!sdkLaunched && (
          <div className="p-6 sm:p-8">
            <h2 className="text-sm font-bold text-slate-900 mb-6">{t("stepsTitle")}</h2>
            <div className="space-y-4">
              {[
                { icon: "🪪", title: t("step1Title"), desc: t("step1Desc") },
                { icon: "📸", title: t("step2Title"), desc: t("step2Desc") },
                { icon: "✅", title: t("step3Title"), desc: t("step3Desc") },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-lg shrink-0">
                    {step.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sumsub React SDK */}
        {sdkLaunched && sumsubToken && (
          <div className="min-h-[400px]">
            <SumsubWebSdk
              accessToken={sumsubToken}
              expirationHandler={handleTokenExpired}
              config={{
                lang: "en",
                theme: "light",
              }}
              options={{
                addViewportTag: false,
                adaptIframeHeight: true,
              }}
              onMessage={handleSumsubMessage}
              onError={handleSumsubError}
            />
          </div>
        )}

        {/* Start button */}
        {!sdkLaunched && (
          <div className="px-6 sm:px-8 pb-8">
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
                {error}
              </div>
            )}

            <button
              onClick={launchSumsub}
              disabled={sumsubConfigured === null}
              className="w-full py-3.5 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-40 transition-all"
            >
              {sumsubConfigured === null ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  {t("loading")}
                </span>
              ) : (
                isRejected ? t("retryButton") : t("startButton")
              )}
            </button>
          </div>
        )}
      </div>

      {/* Privacy note */}
      <div className="text-center">
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          {t("privacyNote")}
        </p>
      </div>
    </div>
  );
}

/* ─── Manual KYC Form (fallback when Sumsub not configured) ─── */
function ManualKycForm({ wallet, onSubmit }: { wallet: string; onSubmit: () => void }) {
  const t = useTranslations("kyc");
  const [form, setForm] = useState({
    full_name: "",
    country: "",
    document_type: "passport",
    document_id: "",
    email: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/kyc/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, ...form }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Submission failed");
      }

      onSubmit();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all";
  const labelClass = "block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2">
        <p className="text-xs text-amber-700">{t("manualNote")}</p>
      </div>

      <div>
        <label className={labelClass}>{t("fieldName")}</label>
        <input type="text" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="John Doe" className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{t("fieldCountry")}</label>
          <input type="text" required value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="DE" maxLength={3} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t("fieldDocType")}</label>
          <select value={form.document_type} onChange={e => setForm({ ...form, document_type: e.target.value })} className={inputClass}>
            <option value="passport">{t("docPassport")}</option>
            <option value="national_id">{t("docNationalId")}</option>
            <option value="drivers_license">{t("docDriversLicense")}</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>{t("fieldDocId")}</label>
        <input type="text" required value={form.document_id} onChange={e => setForm({ ...form, document_id: e.target.value })} placeholder="Document number" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("fieldEmail")}</label>
        <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" className={inputClass} />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button type="submit" disabled={submitting} className="w-full py-3 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-40 transition-all">
        {submitting ? t("submitting") : t("submitButton")}
      </button>
    </form>
  );
}
