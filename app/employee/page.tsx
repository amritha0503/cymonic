"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { UploadCloud, FileText, ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Check, Clock, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./employee.module.css";
import { supabase } from "@/lib/supabase";

type OCRData = {
  merchant: string;
  date: string | null;
  total_amount: number | null;
  currency: string;
  quality_check: string;
};

export default function EmployeePortal() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  const [claimedDate, setClaimedDate] = useState("");
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [ocrData, setOcrData] = useState<OCRData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [myClaims, setMyClaims] = useState<any[]>([]);
  const router = useRouter();

  const fetchClaims = async () => {
    const { data } = await supabase
      .from('claims')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setMyClaims(data);
  };

  useEffect(() => {
    fetchClaims();

    // Listen for realtime updates to simulate Notification System
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'claims' }, (payload: any) => {
        fetchClaims();
        // Trigger a dashboard alert when a claim gets audited or overridden
        if (payload.new && payload.new.status) {
           alert(`Notification: A claim's status has been updated to ${payload.new.status.toUpperCase()}!`);
        }
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    }
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setOcrData(null); // Reset when file changes
      setErrorMsg("");
      if (selectedFile.type.startsWith('image/')) {
        setPreviewUrl(URL.createObjectURL(selectedFile));
      } else {
        setPreviewUrl(null);
      }
    }
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    
    setIsExtracting(true);
    setErrorMsg("");
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract data');
      
      setOcrData(data.data);
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (!file || !purpose) return;
    
    setIsSubmitting(true);
    setErrorMsg("");
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', purpose);
      formData.append('date', claimedDate);
      if (ocrData) {
        formData.append('merchant', ocrData.merchant || 'Unknown');
        formData.append('amount', ocrData.total_amount?.toString() || '0');
      }
      
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) throw new Error('Upload failed');
      
      setIsSuccess(true);
      fetchClaims();
    } catch (error) {
      console.error(error);
      setErrorMsg('Failed to submit claim');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'approved': return <span className="badge badge-success"><CheckCircle2 size={12} style={{marginRight: '4px'}}/> Approved</span>;
      case 'flagged': return <span className="badge badge-warning"><AlertTriangle size={12} style={{marginRight: '4px'}}/> Flagged</span>;
      case 'rejected': return <span className="badge badge-danger"><XCircle size={12} style={{marginRight: '4px'}}/> Rejected</span>;
      default: return <span className="badge" style={{backgroundColor: 'var(--border-color)', color: 'var(--text-primary)'}}><Clock size={12} style={{marginRight: '4px'}}/> Pending</span>;
    }
  };

  return (
    <div className={styles.main}>
      <header className={styles.header}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link href="/" className={styles.backBtn}>
              <ArrowLeft size={20} />
            </Link>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Employee Claim Submittal</h1>
          </div>
          <button className="btn btn-secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="container wrapper" style={{ maxWidth: '800px', padding: '2rem 1.5rem' }}>
        {isSuccess ? (
          <div className="card flex-center" style={{ flexDirection: 'column', gap: '1rem', padding: '3rem', marginBottom: '2rem' }}>
            <CheckCircle2 size={64} className="badge-success" style={{ background: 'transparent' }} />
            <h2 className="title" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Claim Submitted!</h2>
            <p className="subtitle" style={{ textAlign: 'center' }}>
              Your expense has been successfully uploaded and is pending AI audit. You will be notified shortly.
            </p>
            <button className="btn btn-primary" onClick={() => { 
              setIsSuccess(false); setFile(null); setPreviewUrl(null); setPurpose(""); setClaimedDate(""); setOcrData(null); 
            }}>
              Submit Another
            </button>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>New Expense Report</h2>
            
            {errorMsg && (
              <div style={{ padding: '1rem', background: '#ffebee', color: '#c62828', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <AlertTriangle size={18} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                {errorMsg}
              </div>
            )}

            {!ocrData ? (
              <form onSubmit={handleExtract} className={styles.form}>
                
                <div className={styles.formGroup}>
                  <label className={styles.label}>1. Receipt Evidence</label>
                  <div className={styles.uploadArea} onClick={() => document.getElementById('receipt-upload')?.click()}>
                    <input 
                      type="file" 
                      id="receipt-upload" 
                      className={styles.fileInput} 
                      accept="image/jpeg,image/png,application/pdf"
                      onChange={handleFileChange}
                    />
                    {previewUrl ? (
                      <div className={styles.previewContainer}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewUrl} alt="Receipt preview" className={styles.previewImage} />
                      </div>
                    ) : (
                      <div className={styles.uploadPlaceholder}>
                        <UploadCloud size={48} color="var(--primary-color)" />
                        <p>Click to upload image or PDF</p>
                        <span className={styles.uploadHint}>Max size: 5MB</span>
                      </div>
                    )}
                  </div>
                  {file && <p className={styles.fileName}>Selected: {file.name}</p>}
                </div>

                <div className={styles.formGroup} style={{display: 'flex', gap: '1rem'}}>
                     <div style={{flex: 1}}>
                         <label className={styles.label}>Claimed Expense Date</label>
                         <input 
                         type="date" 
                         className="input-field" 
                         value={claimedDate}
                         onChange={(e) => setClaimedDate(e.target.value)}
                         required
                         style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '1rem' }}
                         />
                     </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>2. Business Purpose</label>
                  <textarea 
                    className={`input-field ${styles.textarea}`} 
                    placeholder="e.g., Client dinner with Acme Corp for Q3 negotiations in London"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    rows={4}
                    required
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '1rem', resize: 'vertical' }}
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%', marginTop: '1rem' }}
                  disabled={!file || !purpose || !claimedDate || isExtracting}
                >
                  {isExtracting ? (
                    <><Loader2 size={18} className={styles.spinner} style={{ marginRight: '0.5rem' }} /> Extracting Receipt Details...</>
                  ) : (
                    <><FileText size={18} style={{ marginRight: '0.5rem' }} /> Review & Extract Details</>
                  )}
                </button>
              </form>
            ) : (
              // Review Screen
              <div className={styles.form}>
                 <div style={{ marginBottom: '1.5rem', padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                     <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>Extracted Receipt Information</h3>
                     
                     {ocrData.quality_check === 'blurry' || ocrData.quality_check === 'unreadable' ? (
                       <div style={{ color: '#d32f2f', background: '#ffebee', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
                         <AlertTriangle size={18} style={{ display:'inline', marginRight: '0.5rem', verticalAlign: 'middle' }}/>
                         <strong>Warning:</strong> Receipt appears {ocrData.quality_check}. This may cause the claim to be rejected by the auditing AI.
                       </div>
                     ) : (
                       <div style={{ color: '#2e7d32', background: '#e8f5e9', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
                         <Check size={18} style={{ display:'inline', marginRight: '0.5rem', verticalAlign: 'middle' }}/>
                         Quality check passed.
                       </div>
                     )}

                     {ocrData.date !== claimedDate && ocrData.date ? (
                        <div style={{ color: '#e65100', background: '#fff3e0', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
                          <AlertTriangle size={18} style={{ display:'inline', marginRight: '0.5rem', verticalAlign: 'middle' }}/>
                          <strong>Date Mismatch:</strong> You claimed {claimedDate}, but the receipt date is {ocrData.date}.
                        </div>
                     ) : null}

                     <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                       <tbody>
                         <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                           <th style={{ padding: '0.75rem 0', color: 'var(--text-secondary)' }}>Merchant</th>
                           <td style={{ padding: '0.75rem 0', fontWeight: 500 }}>{ocrData.merchant || 'Not found'}</td>
                         </tr>
                         <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                           <th style={{ padding: '0.75rem 0', color: 'var(--text-secondary)' }}>Date on Receipt</th>
                           <td style={{ padding: '0.75rem 0', fontWeight: 500 }}>{ocrData.date || 'Not found'}</td>
                         </tr>
                         <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                           <th style={{ padding: '0.75rem 0', color: 'var(--text-secondary)' }}>Total Amount</th>
                           <td style={{ padding: '0.75rem 0', fontWeight: 500 }}>{ocrData.total_amount ? `${ocrData.total_amount} ${ocrData.currency || ''}` : 'Not found'}</td>
                         </tr>
                         <tr>
                           <th style={{ padding: '0.75rem 0', color: 'var(--text-secondary)' }}>Business Purpose</th>
                           <td style={{ padding: '0.75rem 0', fontWeight: 500 }}>{purpose}</td>
                         </tr>
                       </tbody>
                     </table>
                 </div>

                 <div style={{ display: 'flex', gap: '1rem' }}>
                   <button 
                     type="button" 
                     className="btn btn-secondary" 
                     style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
                     onClick={() => setOcrData(null)}
                   >
                     Go Back & Edit
                   </button>
                   <button 
                     type="button" 
                     className="btn btn-primary" 
                     style={{ flex: 1 }}
                     onClick={handleFinalSubmit}
                     disabled={isSubmitting}
                   >
                     {isSubmitting ? <Loader2 size={18} className={styles.spinner} /> : 'Confirm & Submit Claim'}
                   </button>
                 </div>
              </div>
            )}
          </div>
        )}

        <div className="card">
          <h2 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>My Recent Claims Status</h2>
          {myClaims.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>You have no recent claims.</p>
          ) : (
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
               <thead>
                 <tr>
                    <th style={{ paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 500 }}>Date submitted</th>
                    <th style={{ paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 500 }}>Claim</th>
                    <th style={{ paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 500, textAlign: 'right' }}>Audit Status</th>
                 </tr>
               </thead>
               <tbody>
                  {myClaims.map((claim) => (
                    <tr key={claim.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 0' }}>{new Date(claim.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '0.75rem 0' }}>
                        <div style={{ fontWeight: 500 }}>{claim.business_purpose || 'Expense'}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>${claim.amount || '0.00'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 0', textAlign: 'right' }}>{getStatusBadge(claim.ai_status || 'pending')}</td>
                    </tr>
                  ))}
               </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
