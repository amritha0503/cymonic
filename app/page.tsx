import Link from "next/link";
import { ArrowRight, Receipt, ShieldCheck, Scale } from "lucide-react";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.main}>
      <header className={styles.header}>
        <div className="container">
          <div className={styles.logo}>
            <ShieldCheck size={28} color="var(--primary-color)" />
            <span>AuditPro</span>
          </div>
        </div>
      </header>

      <main className="container">
        <div className={styles.hero}>
          <h1 className="title">Intelligent Expense Auditing</h1>
          <p className="subtitle">
            The policy-first approach to corporate spend compliance. Say goodbye to manual reviews and non-compliant claims sliding through.
          </p>
          <div className={styles.actions}>
            <Link href="/login?next=/employee" className="btn btn-primary">
              Employee Portal <ArrowRight size={18} style={{ marginLeft: '0.5rem' }} />
            </Link>
            <Link href="/login?next=/finance" className="btn btn-secondary">
              Finance Dashboard
            </Link>
          </div>
        </div>

        <div className={styles.features}>
          <div className="card">
            <Receipt className={styles.icon} />
            <h3 className={styles.cardTitle}>Digital Ingestion</h3>
            <p className={styles.cardDesc}>
              Instant receipt OCR powered by AI vision. Fast extraction of merchants, dates, and amounts.
            </p>
          </div>
          <div className="card">
            <Scale className={styles.icon} />
            <h3 className={styles.cardTitle}>Policy Engine</h3>
            <p className={styles.cardDesc}>
              Automatically cross-reference exact policy rules for total compliance assurance.
            </p>
          </div>
          <div className="card">
            <ShieldCheck className={styles.icon} />
            <h3 className={styles.cardTitle}>Smart Audits</h3>
            <p className={styles.cardDesc}>
              Categorize risk quickly. Traffic light system helps finance teams focus immediately on anomalies.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
