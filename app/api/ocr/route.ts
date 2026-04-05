import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    
    // Convert to Base64
    const base64Image = fileBuffer.toString('base64');
    const mimeType = file.type;

    // We'll use PDF extraction in a production app using specialized tools (like Adobe PDF Extract or PyMuPDF),
    // but for OpenAI vision, we can try analyzing it if it's an image.
    // If it's a PDF, OpenAI Vision doesn't natively support it in this endpoint unless it's converted to images.
    // For this prototype, we'll assume PDF handling could be mocked or rely on an external service.
    
    // Call Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    const textPrompt = `Extract the following details from this receipt and return strictly as JSON:
        - merchant (string)
        - date (YYYY-MM-DD string or null)
        - total_amount (number or null)
        - currency (string, e.g. USD, EUR, GBP)
        - quality_check (string: "clear", "blurry", or "unreadable")
        
        If the receipt is blurry/unreadable and you cannot read the merchant or total, set quality_check to "blurry" or "unreadable".`;

    if (mimeType === 'application/pdf') {
       return NextResponse.json({ 
         error: "PDF OCR extraction requires a backend PDF-to-Image converter in this prototype. Please upload a JPG or PNG instead." 
       }, { status: 400 });
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: textPrompt },
            { inlineData: { mimeType: mimeType, data: base64Image } }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message);
    }

    const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanJsonText = extractedText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let jsonResult;
    try {
      jsonResult = JSON.parse(cleanJsonText || '{}');
    } catch (parseError) {
      console.error("AI JSON Parse Error:", cleanJsonText);
      throw new Error("Failed to parse extracted receipt details");
    }

    return NextResponse.json({ success: true, data: jsonResult });
  } catch (error: any) {
    console.error('OCR Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
