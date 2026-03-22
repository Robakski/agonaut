"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAccount } from "wagmi";
import { usePathname } from "@/i18n/navigation";
import { API_URL } from "@/lib/contracts";

const TYPES = ["idea", "bug", "ux", "other"] as const;
type FeedbackType = (typeof TYPES)[number];

export function FeedbackWidget() {
  const t = useTranslations("feedback");
  const { address } = useAccount();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("idea");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) return;

    setStatus("sending");
    try {
      const res = await fetch(`${API_URL}/feedback/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: message.trim(),
          wallet: address?.toLowerCase(),
          page: pathname,
          email: email || undefined,
          user_agent: navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error();
      setStatus("sent");
      setMessage("");
      setEmail("");
      setTimeout(() => { setStatus("idle"); setOpen(false); }, 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  const typeConfig: Record<FeedbackType, { emoji: string; color: string }> = {
    idea: { emoji: "💡", color: "bg-amber-50 border-amber-200 text-amber-800" },
    bug: { emoji: "🐛", color: "bg-red-50 border-red-200 text-red-800" },
    ux: { emoji: "✨", color: "bg-blue-50 border-blue-200 text-blue-800" },
    other: { emoji: "💬", color: "bg-slate-50 border-slate-200 text-slate-800" },
  };

  return (
    <>
      {/* Floating button — top right area, below navbar */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-20 right-4 z-40 flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-full shadow-lg shadow-slate-200/50 hover:shadow-xl hover:border-slate-300 transition-all group"
        aria-label={t("buttonLabel")}
      >
        <span className="text-sm">💡</span>
        <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-900 hidden sm:inline transition-colors">
          {t("buttonLabel")}
        </span>
      </button>

      {/* Slide-out panel */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/10 backdrop-blur-[1px]">
          <div
            ref={panelRef}
            className="absolute top-0 right-0 w-full max-w-md h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">{t("title")}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{t("subtitle")}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all"
              >
                ✕
              </button>
            </div>

            {status === "sent" ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                  <span className="text-3xl">🙏</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{t("thankYou")}</h3>
                <p className="text-sm text-slate-400">{t("thankYouDesc")}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-6 py-5 overflow-y-auto">
                {/* Type selector */}
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  {t("typeLabel")}
                </label>
                <div className="grid grid-cols-4 gap-2 mb-5">
                  {TYPES.map((tp) => (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => setType(tp)}
                      className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        type === tp
                          ? typeConfig[tp].color + " border-2"
                          : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                      }`}
                    >
                      <span className="text-base">{typeConfig[tp].emoji}</span>
                      {t(`type_${tp}`)}
                    </button>
                  ))}
                </div>

                {/* Message */}
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  {t("messageLabel")}
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("messagePlaceholder")}
                  rows={5}
                  maxLength={5000}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition-all mb-1"
                />
                <div className="text-right text-[10px] text-slate-300 mb-4">
                  {message.length}/5000
                </div>

                {/* Optional email */}
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  {t("emailLabel")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("emailPlaceholder")}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition-all mb-5"
                />

                {/* Context info */}
                <div className="bg-slate-50 rounded-xl px-4 py-3 mb-5 text-[11px] text-slate-400 space-y-1">
                  <div>{t("contextPage")}: <span className="text-slate-600 font-mono">{pathname}</span></div>
                  {address && <div>{t("contextWallet")}: <span className="text-slate-600 font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span></div>}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={message.trim().length < 5 || status === "sending"}
                  className="w-full py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {status === "sending" ? t("sending") : status === "error" ? t("errorRetry") : t("submit")}
                </button>

                {status === "error" && (
                  <p className="text-xs text-red-500 mt-2 text-center">{t("errorMessage")}</p>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
