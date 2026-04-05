import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ maxWidth: "480px", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>Access denied</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
          Your account does not have permission to view this dashboard.
        </p>
        <Link href="/login" className="btn btn-primary">Go to login</Link>
      </div>
    </div>
  );
}
