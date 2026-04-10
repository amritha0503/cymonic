import { NextResponse } from 'next/server';
import { extractReceiptFieldsFromText } from '@/lib/local-audit';

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Expected JSON with ocrText' }, { status: 400 });
    }

    const body = (await req.json()) as { ocrText?: string };
    const ocrText = body.ocrText?.trim();
    if (!ocrText) {
      return NextResponse.json({ error: 'Missing ocrText' }, { status: 400 });
    }
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      throw new Error('Missing GROQ_API_KEY');
    }
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    const receiptFields = await extractReceiptFieldsFromText(ocrText, groqKey, model);
    return NextResponse.json({ success: true, data: receiptFields });
  } catch (error: unknown) {
    console.error('OCR Error:', error);
    const message = error instanceof Error ? error.message : 'OCR failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
