"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import styles from "./reset.module.css";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        throw updateError;
      }

      setMessage("Password updated. You can sign in now.");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className={styles.title}>Reset password</h1>
          <p className={styles.subtitle}>Choose a new password to regain access.</p>

          {error && <div className={styles.error}>{error}</div>}
          {message && <div className={styles.message}>{message}</div>}

          <form onSubmit={handleReset} className={styles.form}>
            <label className={styles.label}>New password</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <label className={styles.label}>Confirm password</label>
            <input
              type="password"
              className="input-field"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
