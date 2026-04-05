import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

// Load .env.local explicitly
config({ path: '.env.local' });

// Usage: npx ts-node scripts/ingest_policy.ts

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_KEY';
const geminiKey = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_KEY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function getEmbedding(text: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: { parts: [{ text: text }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 768
    })
  });

  const data = await response.json();
  if (!data.embedding?.values) {
    throw new Error('Failed to generate embedding: ' + JSON.stringify(data));
  }
  const values = data.embedding.values;
  const norm = Math.sqrt(values.reduce((sum: number, v: number) => sum + v * v, 0));
  return norm > 0 ? values.map((v: number) => v / norm) : values;
}

// A simple chunking function
function chunkText(text: string, maxChars: number = 1000): string[] {
  const paragraphs = text.split('\n\n');
  let currentChunk = '';
  const chunks: string[] = [];

  for (const p of paragraphs) {
    if ((currentChunk.length + p.length) > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += p + '\n\n';
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

async function main() {
  console.log('📖 Starting Policy Ingestion...');
  
  const filePath = path.join(process.cwd(), 'Corporate_Expense_Policy.md');
  if (!fs.existsSync(filePath)) {
    console.error('Cannot find Corporate_Expense_Policy.md in root directory.');
    return;
  }

  const rawText = fs.readFileSync(filePath, 'utf-8');
  const chunks = chunkText(rawText);

  console.log(`✂️  Split document into ${chunks.length} chunks.`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`🧠 Generating embedding for chunk ${i + 1}/${chunks.length}...`);
    try {
      const embedding = await getEmbedding(chunk);
      
      const { error } = await supabase
        .from('policy_chunks')
        .insert({
          section_title: `Section part ${i+1}`,
          content: chunk,
          embedding: embedding
        });

      if (error) {
        console.error('Database Error:', error.message);
      } else {
        console.log(`✅ Stored chunk ${i + 1} successfully.`);
      }
    } catch (e: any) {
       console.log('⚠️ Skipping embedding generation (OpenAI Key likely missing/invalid, this is expected in demo mode): ', e.message);
       break;
    }
  }

  console.log('🎉 Ingestion complete!');
}

main();
