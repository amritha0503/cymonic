# Cymonic Policy-First Expense Auditor

A policy-first expense auditing platform that turns receipt uploads into compliant, explainable decisions. Built to cut review time, reduce spend leakage, and keep auditors in control.

## Why It Matters

Expense reviews are slow and inconsistent when policies live in PDFs and decisions are manual. This project automates OCR, policy matching, and AI reasoning while keeping human override and audit trails front and center.

## What It Does

- Extracts receipt data automatically (OCR)
- Matches claims to the active policy version
- Produces a clear approve/flag/reject decision with rationale
- Lets auditors override and re-audit when policies change
- Notifies employees on status changes

## Core Features

- Receipt upload with OCR (Tesseract in the browser)
- Policy-aware AI audit (approve/flag/reject + reason)
- Auditor dashboard with filters and claim details
- Manual override with mandatory comment + audit trail
- Policy versioning (upload, activate, and manage)
- Re-audit claims by date range and policy version
- PDF policy ingestion and chunking for searchable excerpts
- Real-time notifications for AI/manual status changes

## Additional Enhancements

- Audit event timeline for full traceability
- Policy updater + re-auditor workflow
- Fast OCR mode and worker reuse for better performance

## Planned (Not Completed)

- Local model training with Ollama (not completed due to time constraints)

## Tech Stack

- Frontend: Next.js 14, React 18, TypeScript, CSS Modules
- Backend: Next.js API routes
- Database/Auth/Storage: Supabase (Postgres, RLS, Storage, Auth)
- OCR: Tesseract.js (client-side)
- AI Analysis: Groq API (llama-3.1-8b-instant)
- PDF parsing: pdf-parse

## Setup

### Prerequisites

- Node.js 18+ (20+ recommended)
- Supabase project (Auth, DB, Storage)
- Groq API key

### Environment Variables

Create a .env.local file in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

GROQ_API_KEY=...
GROQ_MODEL=llama-3.1-8b-instant
```

Optional:

```
GEMINI_API_KEY=...
```

### Install

```
npm install
```

### Run Locally

```
npm run dev
```

Open the URL printed by Next.js (usually http://localhost:3000).

## Supabase Setup

1) Run the SQL in supabase/schema.sql
2) Create a receipts storage bucket
3) Ensure profiles have role set to employee or auditor

## Backend (Supabase) Details

**Database (Postgres)**
- `claims` stores expense submissions, AI results, and manual overrides
- `policy_versions` tracks active/inactive policies
- `policy_chunks` stores policy text chunks with embeddings
- `audit_events` records AI/auditor actions for traceability
- RPC: `match_policy` performs vector similarity search on policy chunks

**Auth + RLS**
- Employees can read their own claims
- Auditors can read all claims, policy versions, and audit events

**Storage**
- Bucket: `receipts` for receipt images

## OCR + AI Flow (High Level)

1) Client runs Tesseract OCR on the uploaded receipt
2) OCR text is parsed into structured fields
3) Claim is stored and AI audit runs with policy excerpts
4) Decision is saved and surfaced to employee and auditor

## Testing Notes

- Use smaller or cropped images for faster OCR
- If AI stays pending, check server logs and GROQ_API_KEY


Built for fast review cycles, strong compliance, and clear accountability.
