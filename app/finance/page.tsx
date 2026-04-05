"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Filter, AlertCircle, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./finance.module.css";
import { supabase } from "@/lib/supabase";

export default function FinanceDashboard() {
  const [filter, setFilter] = useState("all");
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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
          (riskWeights[a.ai_status || 'pending'] || 5) - (riskWeights[b.ai_status || 'pending'] || 5) || 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setClaims(sortedData);
      }
      if (error) console.error("Error fetching claims:", error);
      setLoading(false);
    }
    fetchClaims();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };


  const filteredClaims = claims.filter(claim => filter === "all" || (claim.ai_status || 'pending') === filter);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'approved': return <span className="badge badge-success"><CheckCircle2 size={14} style={{marginRight: '4px'}}/> Approved</span>;
      case 'flagged': return <span className="badge badge-warning"><AlertCircle size={14} style={{marginRight: '4px'}}/> Flagged</span>;
      case 'rejected': return <span className="badge badge-danger"><XCircle size={14} style={{marginRight: '4px'}}/> Rejected</span>;
      default: return <span className="badge" style={{backgroundColor: 'var(--border-color)', color: 'var(--text-primary)'}}><Clock size={14} style={{marginRight: '4px'}}/> Pending</span>;
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
                      <td style={{ fontWeight: 600 }}>${claim.amount || '0.00'}</td>
                      <td>{getStatusBadge(claim.ai_status || 'pending')}</td>
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
