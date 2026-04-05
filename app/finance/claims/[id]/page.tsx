"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, FileText, ChevronRight, Loader2 } from "lucide-react";
import styles from "./claim.module.css";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function ClaimDetail({ params }: { params: { id: string } }) {
  const [overrideComment, setOverrideComment] = useState("");
  const [claim, setClaim] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchClaim() {
      const { data, error } = await supabase
        .from('claims')
        .select('*')
        .eq('id', params.id)
        .single();
        
      if (data) {
        setClaim(data);
      }
      if (error) console.error("Fetch Claim Error:", error);
      setLoading(false);
    }
    fetchClaim();
  }, [params.id]);

  const handleOverride = async (status: 'approved' | 'rejected') => {
    
    const res = await fetch('/api/override', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimId: claim.id, newStatus: status, comment: overrideComment })
    });
    
    if (res.ok) {
       // Refresh locally
       const { data } = await supabase
         .from('claims')
         .select('*')
         .eq('id', params.id)
         .single();
       if (data) setClaim(data);
    } else {
       alert("Failed to override claim.");
    }
  };

  if (loading) {
     return (
       <div className={styles.main} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
         <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
       </div>
     );
  }

  if (!claim) {
     return (
       <div className={styles.main} style={{ padding: '2rem', textAlign: 'center' }}>
         <h1>Claim Not Found</h1>
         <Link href="/finance">Return to dashboard</Link>
       </div>
     );
  }

  return (
    <div className={styles.main}>
      <header className={styles.header}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/finance" className={styles.backBtn}>
            <ArrowLeft size={20} />
          </Link>
          <div className={styles.breadcrumb}>
            <Link href="/finance">Finance</Link>
            <ChevronRight size={16} />
            <span>Claim {String(claim.id).substring(0, 8)}...</span>
          </div>
        </div>
      </header>

      <main className="container wrapper" style={{ padding: '2rem 1.5rem' }}>
        <div className={styles.grid}>
          {/* LEFT: RECEIPT */}
          <div className={styles.leftCol}>
            <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <h2 className={styles.sectionTitle}>Receipt Overview</h2>
              <div className={styles.receiptBox}>
                {claim.receipt_image_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img 
                    src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/receipts/${claim.receipt_image_path}`} 
                    alt="Receipt" 
                    style={{ maxWidth: '100%', maxHeight: '400px' }} 
                  />
                ) : (
                  <div className={styles.mockReceipt}>
                     <h3>{claim.merchant || "Unknown"}</h3>
                     <p>{claim.date || new Date(claim.created_at).toLocaleDateString()}</p>
                     <br/>
                     <p>Receipt digitally processed.</p>
                     <p>Line items requested via OCR.</p>
                     <br/>
                     <h3 style={{ borderTop: '1px solid currentColor', paddingTop: '0.5rem' }}>Total: ${claim.amount || '0.00'}</h3>
                  </div>
                )}
              </div>
              <div className={styles.dataExtract}>
                <div className={styles.dataItem}>
                  <span className={styles.dataLabel}>Merchant</span>
                  <span className={styles.dataValue}>{claim.merchant || 'N/A'}</span>
                </div>
                <div className={styles.dataItem}>
                  <span className={styles.dataLabel}>Date</span>
                  <span className={styles.dataValue}>{claim.date || new Date().toLocaleDateString()}</span>
                </div>
                <div className={styles.dataItem}>
                  <span className={styles.dataLabel}>Amount</span>
                  <span className={styles.dataValue}>${claim.amount || '0.00'}</span>
                </div>
                <div className={styles.dataItem} style={{ gridColumn: '1 / -1' }}>
                  <span className={styles.dataLabel}>Business Purpose</span>
                  <span className={styles.dataValue}>{claim.business_purpose || claim.purpose || 'No purpose supplied.'}</span>
                </div>
              </div>
            </div>
          </div>

           {/* RIGHT: AUDIT RESULTS */}
          <div className={styles.rightCol}>
             {claim.ai_status === null || claim.ai_status === undefined || !claim.ai_reason ? (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                 <h2>Pending AI Evaluation...</h2>
                </div>
             ) : (
              <div className="card" style={{ marginBottom: '1.5rem', borderColor: claim.ai_status === 'flagged' || claim.ai_status === 'rejected' ? 'var(--warning-color)' : 'var(--success-color)' }}>
                <div className={styles.verdictHeader}>
                {claim.ai_status === "approved" ? <CheckCircle2 size={24} color="var(--success-color)" /> : <AlertTriangle size={24} color="var(--warning-color)" />}
                <h2>AI Audit Verdict: {String(claim.ai_status).toUpperCase()}</h2>
                  <span className="badge" style={{ marginLeft: 'auto' }}>Confidence: {claim.ai_confidence || 95}%</span>
                </div>
                
                <div className={styles.reasonBox}>
                  <strong>Reason:</strong> {claim.ai_reason}
                </div>

                <div className={styles.policyExcerpt}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontWeight: 600 }}>
                    <FileText size={18} /> Found Policy Rule
                  </div>
                  {claim.policy_excerpt}
                </div>
              </div>
            )}

            <div className="card">
              <h2 className={styles.sectionTitle}>Manual Override</h2>
              <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                Current manual status: <strong style={{ color: 'var(--text-primary)' }}>{claim.status || 'pending'}</strong>
              </div>
              {claim.override_comment ? (
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-md)' }}>
                  <p><strong>Overridden by Finance:</strong></p>
                  <p>"{claim.override_comment}"</p>
                </div>
              ) : (
                <div className={styles.overrideForm}>
                  <textarea 
                    className="input-field" 
                    placeholder="Add mandatory comment for manual override..."
                    rows={3}
                    value={overrideComment}
                    onChange={(e) => setOverrideComment(e.target.value)}
                  />
                  <div className={styles.actionBtns}>
                    <button 
                      className="btn" 
                      style={{ backgroundColor: 'var(--danger-color)', color: 'white', flex: 1 }}
                      onClick={() => handleOverride('rejected')}
                    >
                      <XCircle size={18} style={{ marginRight: '0.5rem' }} /> Force Reject
                    </button>
                    <button 
                      className="btn" 
                      style={{ backgroundColor: 'var(--success-color)', color: 'white', flex: 1 }}
                      onClick={() => handleOverride('approved')}
                      disabled={!overrideComment && claim.status !== 'approved'}
                    >
                      <CheckCircle2 size={18} style={{ marginRight: '0.5rem' }} /> Force Approve
                    </button>
                  </div>
                  {!overrideComment && claim.status !== 'approved' && (
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>* Comment required to override AI classification.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
