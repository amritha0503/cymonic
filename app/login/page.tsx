"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import styles from "./login.module.css";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [role, setRole] = useState<"employee" | "auditor">("employee");
  const [resetSent, setResetSent] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const lookupRes = await fetch(`/api/auth/lookup?username=${encodeURIComponent(username)}`);
      if (!lookupRes.ok) {
        throw new Error("Username not found");
      }
      const lookupData = await lookupRes.json();
      const lookupEmail = lookupData?.email as string | undefined;
      if (!lookupEmail) {
        throw new Error("Username not found");
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: lookupEmail,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Unable to load user session");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError || !profile?.role) {
        throw new Error("Your account does not have a role assigned. Please contact admin.");
      }

      const normalizedRole = String(profile.role).toLowerCase();

      if (normalizedRole === "employee") {
        router.push(nextPath.startsWith("/employee") ? nextPath : "/employee");
        return;
      }

      if (normalizedRole === "auditor") {
        router.push(nextPath.startsWith("/finance") ? nextPath : "/finance");
        return;
      }

      setError("Your account does not have a role assigned. Please contact admin.");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { role, username },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      setMessage("Account created. Please check your email to confirm sign in.");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const targetEmail = resetEmail || email;
      if (!targetEmail) {
        throw new Error("Enter your email to reset your password");
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        throw resetError;
      }

      setResetSent(true);
      setResetCooldown(30);
      setMessage("Password reset email sent. Check your inbox.");
    } catch (err: any) {
      setError(err.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (resetCooldown <= 0) return;
    const timer = setInterval(() => {
      setResetCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resetCooldown]);

  return (
    <div className={styles.main}>
      <header className={styles.header}>
        <div className="container" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ShieldCheck size={26} color="var(--primary-color)" />
          <span className={styles.brand}>AuditPro</span>
          <Link href="/" className={styles.backLink}>Back to home</Link>
        </div>
      </header>

      <main className="container" style={{ maxWidth: "480px", padding: "2.5rem 1.5rem" }}>
        <div className="card">
          <h1 className={styles.title}>{mode === "login" ? "Sign in" : "Create account"}</h1>
          <p className={styles.subtitle}>Employees and auditors have separate access.</p>
          {mode === "login" && (
            <p className={styles.helper}>Sign in with your email and password.</p>
          )}

          {error && <div className={styles.error}>{error}</div>}
          {message && <div className={styles.message}>{message}</div>}

          <form onSubmit={mode === "login" ? handleLogin : handleRegister} className={styles.form}>
            {mode === "login" && (
              <>
                <label className={styles.label}>Username</label>
                <input
                  type="text"
                  className="input-field"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </>
            )}

            {mode === "register" && (
              <>
                <label className={styles.label}>Username</label>
                <input
                  type="text"
                  className="input-field"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </>
            )}

            <label className={styles.label}>Email</label>
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required={mode === "register"}
            />

            <label className={styles.label}>Password</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {mode === "register" && (
              <>
                <label className={styles.label}>Role</label>
                <select
                  className="input-field"
                  value={role}
                  onChange={(e) => setRole(e.target.value as "employee" | "auditor")}
                >
                  <option value="employee">Employee</option>
                  <option value="auditor">Auditor</option>
                </select>
              </>
            )}

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading
                ? mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "login"
                ? "Sign in"
                : "Create account"}
            </button>

            {mode === "login" && (
              <button
                type="button"
                className={styles.linkButton}
                onClick={handleResetPassword}
                disabled={loading || resetCooldown > 0}
              >
                {resetCooldown > 0
                  ? `Try again in ${resetCooldown}s`
                  : resetSent
                  ? "Reset email sent"
                  : "Forgot password?"}
              </button>
            )}

            {mode === "login" && (
              <input
                type="email"
                className="input-field"
                placeholder="Email for password reset (optional)"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
            )}
          </form>

          <div className={styles.switchRow}>
            {mode === "login" ? (
              <>
                <span>Don’t have an account?</span>
                <button
                  type="button"
                  className={styles.switchBtn}
                  onClick={() => setMode("register")}
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                <span>Already have an account?</span>
                <button
                  type="button"
                  className={styles.switchBtn}
                  onClick={() => setMode("login")}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
