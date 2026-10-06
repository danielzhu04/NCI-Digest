import React, { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Radio } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { useAuth } from "@/lib/AuthContext";

const ERRORS = {
  google_not_configured: "Google sign-in is not set up on this server yet.",
  invalid_state: "That sign-in link expired. Please try again.",
  token_exchange_failed: "Google did not accept the sign-in. Please try again.",
  email_not_verified: "Your Google email address is not verified.",
  sign_in_failed: "Sign-in failed. Please try again.",
};

export default function Login() {
  const { user, providers, authChecked, checkUserAuth } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next") || "/";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(ERRORS[params.get("error")] || "");
  const [busy, setBusy] = useState(false);

  if (authChecked && user) return <Navigate to={next} replace />;

  async function devLogin(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign-in failed");
      await checkUserAuth();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      icon={Radio}
      title="Sign in to NCI Digest"
      subtitle="Start a collection, convert papers into podcasts, talks, slides, or videos, and share them."
      footer={<Link to="/" className="hover:text-foreground">← Back to community collections</Link>}
    >
      <div className="space-y-6">
        {providers.google ? (
          <a
            href={`/api/auth/google?next=${encodeURIComponent(next)}`}
            className="w-full inline-flex items-center justify-center gap-3 border border-border rounded-lg px-4 py-3 font-body text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <GoogleIcon /> Continue with Google
          </a>
        ) : authChecked ? (
          <p className="font-body text-sm text-muted-foreground">
            Google sign-in is not configured yet. Set <code>GOOGLE_CLIENT_ID</code> and{" "}
            <code>GOOGLE_CLIENT_SECRET</code> on the server.
          </p>
        ) : null}

        {providers.dev && (
          <form onSubmit={devLogin} className="space-y-3 border-t border-border pt-6">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
              Local dev sign-in
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.org"
              className="w-full bg-transparent border-b border-border focus:border-primary outline-none py-2 font-body text-sm"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name (optional)"
              className="w-full bg-transparent border-b border-border focus:border-primary outline-none py-2 font-body text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="font-mono text-xs uppercase tracking-widest bg-primary text-primary-foreground px-5 py-2.5 rounded hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {error && <p className="font-mono text-xs text-destructive">{error}</p>}
      </div>
    </AuthLayout>
  );
}
