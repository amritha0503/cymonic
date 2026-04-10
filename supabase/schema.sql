-- Enable the pgvector extension to work with embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Claims Table
-- Stores the uploaded receipts and their ultimate audit verdicts.
CREATE TABLE IF NOT EXISTS claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID, -- References your auth.users
  employee_name TEXT,
  employee_email TEXT,
  amount DECIMAL(10, 2),
  date DATE,
  merchant TEXT,
  business_purpose TEXT,
  receipt_image_path TEXT,
  policy_version_id UUID,
  
  -- AI Auditor Fields
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'flagged', 'rejected'
  ai_status TEXT, -- 'approved', 'flagged', 'rejected'
  ai_reason TEXT,
  policy_excerpt TEXT,
  ai_confidence DECIMAL(5,2),

  -- Email Notification Fields
  email_sent_at TIMESTAMP WITH TIME ZONE,
  email_error TEXT,
  
  -- Manual Override Fields
  override_comment TEXT,
  overridden_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

-- Employees can read only their own claims
CREATE POLICY "Employees read own claims"
ON claims
FOR SELECT
USING (auth.uid() = employee_id);

-- Auditors can read all claims
CREATE POLICY "Auditors read all claims"
ON claims
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'auditor'
  )
);

-- 2. Policy Chunks Table
-- This stores your 40-page Policy Manual broken down into paragraphs
-- with their respective vector embeddings for similarity search.
CREATE TABLE IF NOT EXISTS policy_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_version_id UUID,
  section_title TEXT,
  content TEXT NOT NULL,
  embedding VECTOR(768) -- Gemini embedding dimensions
);

-- Policy Versions Table
CREATE TABLE IF NOT EXISTS policy_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  effective_date DATE,
  source_filename TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE policy_versions ENABLE ROW LEVEL SECURITY;

-- Auditors can read policy versions
CREATE POLICY "Auditors read policy versions"
ON policy_versions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'auditor'
  )
);

-- Audit Events Table
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL,
  actor_type TEXT NOT NULL, -- 'ai' | 'auditor'
  actor_id UUID,
  action TEXT NOT NULL,
  notes TEXT,
  metadata JSONB,
  policy_version_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Auditors can read audit events
CREATE POLICY "Auditors read audit events"
ON audit_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'auditor'
  )
);

-- 3. Match Policy RPC (Remote Procedure Call)
-- This is the Postgres Function Next.js or edge functions will call via `supabase.rpc('match_policy')`.
-- It takes the vector embedding of the receipt + purpose and finds the closest policy rules.
CREATE OR REPLACE FUNCTION match_policy (
  query_embedding VECTOR(768),
  match_count INT DEFAULT 5,
  p_policy_version_id UUID DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  section_title TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    policy_chunks.id,
    policy_chunks.section_title,
    policy_chunks.content,
    1 - (policy_chunks.embedding <=> query_embedding) AS similarity
  FROM policy_chunks
  WHERE (p_policy_version_id IS NULL OR policy_chunks.policy_version_id = p_policy_version_id)
  -- Only return somewhat relevant results (similarity > threshold if desired)
  ORDER BY policy_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
