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
  
  -- AI Auditor Fields
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'flagged', 'rejected'
  ai_status TEXT, -- 'approved', 'flagged', 'rejected'
  ai_reason TEXT,
  policy_excerpt TEXT,
  ai_confidence DECIMAL(5,2),
  
  -- Manual Override Fields
  override_comment TEXT,
  overridden_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Policy Chunks Table
-- This stores your 40-page Policy Manual broken down into paragraphs
-- with their respective vector embeddings for similarity search.
CREATE TABLE IF NOT EXISTS policy_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section_title TEXT,
  content TEXT NOT NULL,
  embedding VECTOR(768) -- Gemini embedding dimensions
);

-- 3. Match Policy RPC (Remote Procedure Call)
-- This is the Postgres Function Next.js or edge functions will call via `supabase.rpc('match_policy')`.
-- It takes the vector embedding of the receipt + purpose and finds the closest policy rules.
CREATE OR REPLACE FUNCTION match_policy (
  query_embedding VECTOR(768),
  match_count INT DEFAULT 5
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
  -- Only return somewhat relevant results (similarity > threshold if desired)
  ORDER BY policy_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
