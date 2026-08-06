import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../auth/AuthContext";

export default function SignInPage() {
  const { sendCode, verifyCode } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendCode(email.trim());
      setStep("code");
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyCode(email.trim(), code.trim());
      // On success the app re-renders via onAuthStateChange.
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-b from-slate-950 to-slate-900 p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl"
      >
        <div className="mb-6 text-center">
          <div className="text-4xl">💼</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
            Job Tracker
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {step === "email"
              ? "Sign in with your email to continue."
              : `Enter the 6-digit code sent to ${email}.`}
          </p>
        </div>

        {step === "email" ? (
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="you@gmail.com"
            className={inputCls}
          />
        ) : (
          <input
            autoFocus
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            placeholder="123456"
            className={`${inputCls} text-center text-lg tracking-[0.5em]`}
          />
        )}

        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

        <button
          onClick={step === "email" ? send : verify}
          disabled={busy || (step === "email" ? !email.trim() : !code.trim())}
          className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "…" : step === "email" ? "Send code" : "Verify & sign in"}
        </button>

        {step === "code" && (
          <button
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="mt-3 w-full text-center text-sm text-slate-400 hover:text-slate-200"
          >
            ← Use a different email
          </button>
        )}

        <p className="mt-6 text-center text-xs text-slate-600">
          We'll email you a one-time code — no password needed.
        </p>
      </motion.div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-600 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500";

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
