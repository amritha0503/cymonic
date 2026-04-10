"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Filter, AlertCircle, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./finance.module.css";
import { supabase } from "@/lib/supabase";

export default function FinanceDashboard() {
  const [filter, setFilter] = useState("all");
  const [claims, setClaims] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [policyVersions, setPolicyVersions] = useState<Record<string, unknown>[]>([]);
  const [policyName, setPolicyName] = useState('');
  const [policyEffectiveDate, setPolicyEffectiveDate] = useState('');
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [reAuditStart, setReAuditStart] = useState('');
  const [reAuditEnd, setReAuditEnd] = useState('');
  const [reAuditVersionId, setReAuditVersionId] = useState('');
  const [policyMessage, setPolicyMessage] = useState('');

  const getFinalStatus = (claim: Record<string, unknown>) => {
    const overriddenAt = claim.overridden_at as string | null | undefined;
    const status = claim.status as string | null | undefined;
    const aiStatus = claim.ai_status as string | null | undefined;
    if (overriddenAt && status) return status;
    return aiStatus || 'pending';
  };

  useEffect(() => {
    async function fetchClaims() {
      // In production, we fetch real claims ordered by latest
      const { data, error } = await supabase
        .from('claims')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (data) {
        const riskWeights: Record<string, number> = { 'flagged': 1, 'rejected': 2, 'pending': 3, 'approved': 4 };
        const sortedData = data.sort((a, b) =>
          (riskWeights[getFinalStatus(a)] || 5) - (riskWeights[getFinalStatus(b)] || 5) ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setClaims(sortedData as Record<string, unknown>[]);
      }
      if (error) console.error("Error fetching claims:", error);
      setLoading(false);
    }
    async function fetchPolicyVersions() {
      const { data } = await supabase
        .from('policy_versions')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) {
        setPolicyVersions(data as Record<string, unknown>[]);
        const active = data.find((version) => version.is_active);
        if (active?.id) {
          setReAuditVersionId(String(active.id));
        }
      }
    }
    fetchClaims();
    fetchPolicyVersions();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };


  const filteredClaims = claims.filter(claim => filter === "all" || getFinalStatus(claim) === filter);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'approved': return <span className="badge badge-success"><CheckCircle2 size={14} style={{marginRight: '4px'}}/> Approved</span>;
      case 'flagged': return <span className="badge badge-warning"><AlertCircle size={14} style={{marginRight: '4px'}}/> Flagged</span>;
      case 'rejected': return <span className="badge badge-danger"><XCircle size={14} style={{marginRight: '4px'}}/> Rejected</span>;
      default: return <span className="badge" style={{backgroundColor: 'var(--border-color)', color: 'var(--text-primary)'}}><Clock size={14} style={{marginRight: '4px'}}/> Pending</span>;
    }
  };

  const handlePolicyUpload = async () => {
    setPolicyMessage('');
    if (!policyFile || !policyName) {
      setPolicyMessage('Please provide a policy name and file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', policyFile);
    formData.append('name', policyName);
    formData.append('effective_date', policyEffectiveDate);
    formData.append('make_active', 'true');

    const res = await fetch('/api/policy/upload', {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      setPolicyMessage('Policy uploaded and activated.');
      setPolicyFile(null);
      setPolicyName('');
      setPolicyEffectiveDate('');
      const { data } = await supabase
        .from('policy_versions')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) {
        setPolicyVersions(data as Record<string, unknown>[]);
        const active = data.find((version) => version.is_active);
        if (active?.id) {
          setReAuditVersionId(String(active.id));
        }
      }
    } else {
      const payload = await res.json().catch(() => ({}));
      setPolicyMessage(payload?.error || 'Failed to upload policy.');
    }
  };

  const handleReAudit = async () => {
    setPolicyMessage('');
    if (!reAuditStart || !reAuditEnd) {
      setPolicyMessage('Please choose a date range to re-audit.');
      return;
    }

    const res = await fetch('/api/policy/re-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: reAuditStart,
        endDate: reAuditEnd,
        policyVersionId: reAuditVersionId || undefined,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (res.ok) {
      setPolicyMessage(`Re-audit started for ${payload.processed || 0} claims.`);
    } else {
      setPolicyMessage(payload?.error || 'Failed to start re-audit.');
    }
  };

  return (
    <div className={styles.main}>
      <header className={styles.header}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link href="/" className={styles.backBtn}>
              <ArrowLeft size={20} />
            </Link>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Auditor Dashboard</h1>
          </div>
          <div className={styles.headerUser}>
            <span>Finance Approver</span>
            <div className={styles.avatar}>FA</div>
          </div>
          <button className="btn btn-secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="container wrapper" style={{ padding: '2rem 1.5rem' }}>
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Policy Versioning</h2>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Policy name</label>
              <input
                className="input-field"
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
                placeholder="Q2 Policy Update"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Effective date</label>
              <input
                type="date"
                className="input-field"
                value={policyEffectiveDate}
                onChange={(e) => setPolicyEffectiveDate(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Policy file (.md, .txt, .pdf)</label>
              <input
                type="file"
                className="input-field"
                accept=".md,.txt,.pdf"
                onChange={(e) => setPolicyFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handlePolicyUpload}>Upload & Activate</button>
          </div>

          <div style={{ marginTop: '1.5rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Re-audit start</label>
              <input
                type="date"
                className="input-field"
                value={reAuditStart}
                onChange={(e) => setReAuditStart(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Re-audit end</label>
              <input
                type="date"
                className="input-field"
                value={reAuditEnd}
                onChange={(e) => setReAuditEnd(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Policy version</label>
              <select
                className="input-field"
                value={reAuditVersionId}
                onChange={(e) => setReAuditVersionId(e.target.value)}
              >
                <option value="">Active policy</option>
                {policyVersions.map((version) => (
                  <option key={String(version.id)} value={String(version.id)}>
                    {String(version.name)}{version.is_active ? ' (active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={handleReAudit}>Re-audit claims</button>
            {policyMessage && <span style={{ color: 'var(--text-secondary)' }}>{policyMessage}</span>}
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBar}>
            <Search size={18} className={styles.searchIcon} />
            <input type="text" placeholder="Search employee, claim ID..." className={`input-field ${styles.searchInput}`} />
          </div>
          <div className={styles.filters}>
            <Filter size={18} color="var(--text-secondary)" />
            <select className="input-field" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }}>
              <option value="all">All Statuses</option>
              <option value="flagged">Attention Required (Flagged/Rejected)</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>
          </div>
        </div>

        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div className={styles.tableResponsive}>
            {loading ? (
              <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                <Loader2 size={24} className={styles.spin} /> Loading claims...
              </div>
            ) : claims.length === 0 ? (
               <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                 No claims found.
               </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Claim ID</th>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Merchant</th>
                    <th>Amount</th>
                    <th>AI Risk Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClaims.map((claim) => (
                    <tr key={claim.id} className={claim.status === 'flagged' ? styles.rowHighlight : ''}>
                      <td style={{ fontWeight: 500 }}>{String(claim.id).substring(0, 8)}...</td>
                      <td>{claim.employee_name || 'N/A'}</td>
                      <td>{claim.date || new Date(claim.created_at).toLocaleDateString()}</td>
                      <td>{claim.merchant || 'N/A'}</td>
                      <td style={{ fontWeight: 600 }}>Rs. {claim.amount || '0.00'}</td>
                      <td>{getStatusBadge(getFinalStatus(claim))}</td>
                      <td>
                        <Link href={`/finance/claims/${claim.id}`} className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}>
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
