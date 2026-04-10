import { createWorker, PSM, type Worker } from 'tesseract.js';
import { createRequire } from 'module';
import type { SupabaseClient } from '@supabase/supabase-js';

type PolicyChunk = {
  content: string;
};

type ReceiptFields = {
  merchant?: string;
  date?: string | null;
  total_amount?: number | null;
  currency?: string;
  quality_check?: string;
};

type AuditResult = {
  status: 'approved' | 'flagged' | 'rejected';
  reason: string;
  policy_excerpt?: string;
  confidence?: number;
};

function extractJsonFromText(text: string): any | null {
  const match = text.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : text;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

async function callGroqJson(systemPrompt: string, userPrompt: string, groqKey: string, model: string) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || 'Groq request failed';
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content || '{}';
  const parsed = extractJsonFromText(content);
  if (!parsed) {
    throw new Error('Groq response was not valid JSON');
  }
  return parsed;
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const require = createRequire(import.meta.url);
    const workerPath = require.resolve('tesseract.js/dist/worker.min.js');
    const corePath = require.resolve('tesseract.js-core/tesseract-core.wasm.js');

    workerPromise = (async () => {
      const worker = await createWorker('eng', undefined, {
        workerPath,
        corePath,
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });
      return worker;
    })();
  }

  return workerPromise;
}

async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer);
  return data?.text || '';
}

export async function extractReceiptFieldsFromText(
  ocrText: string,
  groqKey: string,
  model: string
): Promise<ReceiptFields> {
  if (!ocrText.trim()) {
    return {
      merchant: 'Unknown',
      date: null,
      total_amount: null,
      currency: 'INR',
      quality_check: 'unreadable',
    };
  }
  const systemPrompt =
    'You extract receipt fields from OCR text. Return JSON only with keys: merchant, date, total_amount, currency, quality_check.';
  const userPrompt = `Receipt OCR text:\n${ocrText}`;
  try {
    return (await callGroqJson(systemPrompt, userPrompt, groqKey, model)) as ReceiptFields;
  } catch {
    return {
      merchant: 'Unknown',
      date: null,
      total_amount: null,
      currency: 'INR',
      quality_check: 'unreadable',
    };
  }
}

export async function extractReceiptFields(
  buffer: Buffer,
  groqKey: string,
  model: string,
  ocrText?: string
): Promise<ReceiptFields> {
  if (ocrText && ocrText.trim()) {
    return extractReceiptFieldsFromText(ocrText, groqKey, model);
  }

  const extractedText = await extractTextFromImage(buffer);
  return extractReceiptFieldsFromText(extractedText, groqKey, model);
}

async function getPolicyExcerpts(supabase: SupabaseClient, policyVersionId: string | null) {
  let query = supabase
    .from('policy_chunks')
    .select('content')
    .limit(5);

  if (policyVersionId) {
    query = query.eq('policy_version_id', policyVersionId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const typedChunks = (data ?? []) as PolicyChunk[];
  return typedChunks.length > 0
    ? typedChunks.map((chunk) => chunk.content).join('\n---\n')
    : 'No specific policy matched.';
}

export async function runLocalAudit(params: {
  supabase: SupabaseClient;
  claimId: string;
  businessPurpose: string;
  imageBuffer: Buffer;
  policyVersionId?: string | null;
  groqKey: string;
  model: string;
  ocrText?: string;
}) {
  const { supabase, claimId, businessPurpose, imageBuffer, groqKey, model, ocrText } = params;
  let policyVersionId = params.policyVersionId ?? null;

  if (!policyVersionId) {
    const { data: activePolicy } = await supabase
      .from('policy_versions')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    policyVersionId = activePolicy?.id || null;
  }

  const receiptFields = await extractReceiptFields(imageBuffer, groqKey, model, ocrText);
  const policyExcerpts = await getPolicyExcerpts(supabase, policyVersionId);

  const systemPrompt =
    'You are a corporate expense auditor. Return JSON only: { "status": "approved" | "flagged" | "rejected", "reason": "string", "policy_excerpt": "string", "confidence": number_0_to_100 }.';
  const userPrompt = `Receipt JSON: ${JSON.stringify(receiptFields)}\nBusiness purpose: ${businessPurpose}\nPolicy excerpts: ${policyExcerpts}`;
  let auditData: AuditResult;
  try {
    auditData = (await callGroqJson(systemPrompt, userPrompt, groqKey, model)) as AuditResult;
  } catch {
    auditData = {
      status: 'flagged',
      reason: 'AI response malformed. Please review manually.',
      policy_excerpt: policyExcerpts,
      confidence: 0,
    };
  }

  const { error: claimUpdateError } = await supabase
    .from('claims')
    .update({
      ai_status: auditData.status,
      ai_reason: auditData.reason,
      policy_excerpt: auditData.policy_excerpt ?? policyExcerpts,
      ai_confidence: auditData.confidence ?? null,
      policy_version_id: policyVersionId,
    })
    .eq('id', claimId);

  if (claimUpdateError) {
    throw claimUpdateError;
  }

  await supabase.from('audit_events').insert({
    claim_id: claimId,
    actor_type: 'ai',
    action: 'ai_verdict',
    notes: auditData.reason || null,
    policy_version_id: policyVersionId,
    metadata: {
      status: auditData.status,
      confidence: auditData.confidence ?? null,
    },
  });

  return { auditData, policyVersionId, receiptFields };
}
