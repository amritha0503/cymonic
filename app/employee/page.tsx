"use client";

import { useState, useEffect, useRef } from "react";
import { createWorker, PSM, type Worker } from "tesseract.js";
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

type Claim = {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  employee_email: string | null;
  amount: number | null;
  date: string | null;
  merchant: string | null;
  business_purpose: string | null;
  ai_status: string | null;
  ai_reason: string | null;
  status: string | null;
  override_comment: string | null;
  overridden_at: string | null;
  created_at: string;
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
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  const [notifications, setNotifications] = useState<
    { id: string; message: string; createdAt: string }[]
  >([]);

  const [myClaims, setMyClaims] = useState<Claim[]>([]);
  const router = useRouter();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ocrWorkerRef = useRef<Promise<Worker> | null>(null);

  const getOcrWorker = () => {
    if (!ocrWorkerRef.current) {
      ocrWorkerRef.current = (async () => {
        const worker = await createWorker('eng', undefined, {
          workerPath: 'https://unpkg.com/tesseract.js@5/dist/worker.min.js',
          corePath: 'https://unpkg.com/tesseract.js-core@5/tesseract-core.wasm.js',
          langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        });
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        });
        return worker;
      })();
    }
    return ocrWorkerRef.current;
  };

  const fetchClaims = async (userId: string) => {
    if (!userId) return;
    const { data } = await supabase
      .from('claims')
      .select('*')
      .eq('employee_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setMyClaims(data as Claim[]);
  };

  const buildNotificationMessage = (claim: Claim) => {
    if (claim?.overridden_at && claim?.status) {
      const note = claim.override_comment ? ` Comment: ${claim.override_comment}` : "";
      return `Manual override: claim ${String(claim.id).slice(0, 8)} is ${String(claim.status).toUpperCase()}.${note}`;
    }
    if (claim?.ai_status) {
      const reason = claim.ai_reason ? ` Reason: ${claim.ai_reason}` : "";
      return `AI status update: claim ${String(claim.id).slice(0, 8)} is ${String(claim.ai_status).toUpperCase()}.${reason}`;
    }
    return null;
  };

  const fetchNotificationsFromClaims = async (userId: string) => {
    if (!userId) return;
    const { data } = await supabase
      .from('claims')
      .select('id, ai_status, ai_reason, status, override_comment, overridden_at, created_at')
      .eq('employee_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      const mapped = data
        .map((claim) => {
          const typedClaim = claim as Claim;
          const message = buildNotificationMessage(typedClaim);
          if (!message) return null;
          return {
            id: String(typedClaim.id),
            message,
            createdAt: typedClaim.overridden_at || typedClaim.created_at,
          };
        })
        .filter(Boolean) as { id: string; message: string; createdAt: string }[];

      mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(mapped.slice(0, 10));
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isActive) return;

      setEmployeeId(user.id || "");
      setEmployeeEmail(user.email || "");

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single();

      if (profile?.username) {
        setEmployeeName(profile.username);
      }

      fetchClaims(user.id);
      fetchNotificationsFromClaims(user.id);

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channelName = `claims-updates-${user.id}-${Math.random().toString(36).slice(2)}`;
      const channel = supabase.channel(channelName);
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'claims', filter: `employee_id=eq.${user.id}` },
        (payload: unknown) => {
          const change = payload as { new: Claim; old: Claim | null };
          fetchClaims(user.id);
          fetchNotificationsFromClaims(user.id);

          const hasManualOverride =
            change.new?.overridden_at && change.new?.overridden_at !== change.old?.overridden_at;
          const aiStatusChanged = change.new?.ai_status && change.new?.ai_status !== change.old?.ai_status;

          if (hasManualOverride || aiStatusChanged) {
            const claim = hasManualOverride
              ? change.new
              : { ...change.new, status: null, override_comment: null, overridden_at: null };
            const message = buildNotificationMessage(claim) || "Notification received.";
            alert(`Notification: ${message}`);
          }
        }
      );
      channel.subscribe();

      channelRef.current = channel;
    };

    loadProfile();

    return () => {
      isActive = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
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
      setOcrText(null);
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
      if (!file.type.startsWith('image/')) {
        throw new Error('Only image files are supported for OCR');
      }
      const worker = await getOcrWorker();
      const ocrResult = await worker.recognize(file);
      const extractedText = ocrResult?.data?.text || '';
      setOcrText(extractedText);

      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocrText: extractedText }),
      });
      
      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || 'Failed to extract data');
      
      setOcrData(responseData.data);
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
      if (employeeEmail) {
        formData.append('employee_email', employeeEmail);
      }
      if (employeeId) {
        formData.append('employee_id', employeeId);
      }
      if (employeeName) {
        formData.append('employee_name', employeeName);
      }
      if (ocrData) {
        formData.append('merchant', ocrData.merchant || 'Unknown');
        formData.append('amount', ocrData.total_amount?.toString() || '0');
      }
      if (ocrText) {
        formData.append('ocr_text', ocrText);
      }
      
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) throw new Error('Upload failed');
      
      setIsSuccess(true);
      fetchClaims(employeeId);
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

  const getFinalStatus = (claim: Claim) => {
    if (claim?.overridden_at && claim?.status) return claim.status;
    return claim?.ai_status || 'pending';
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
              setIsSuccess(false); setFile(null); setPreviewUrl(null); setPurpose(""); setClaimedDate(""); setOcrData(null); setOcrText(null);
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
                           <td style={{ padding: '0.75rem 0', fontWeight: 500 }}>{ocrData.total_amount ? `Rs. ${ocrData.total_amount} ${ocrData.currency || 'INR'}` : 'Not found'}</td>
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

        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>Notifications</h2>
          {notifications.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No updates yet. Status changes will appear here.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {notifications.map((note) => (
                <div key={note.id} style={{ padding: '0.75rem 1rem', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'var(--bg-secondary)' }}>
                  <div style={{ fontWeight: 600 }}>{note.message}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {new Date(note.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Rs. {claim.amount || '0.00'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 0', textAlign: 'right' }}>{getStatusBadge(getFinalStatus(claim))}</td>
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
