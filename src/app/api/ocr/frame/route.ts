import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface OcrPlayerDraft {
  name: string;
  position?: string;
  overall?: number;
  raw?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl } = await req.json();
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return NextResponse.json({ error: 'imageDataUrl fehlt' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        configured: false,
        message: 'OPENAI_API_KEY ist nicht gesetzt. Frame wurde extrahiert; bitte manuell prüfen oder API-Key setzen.',
        players: [] as OcrPlayerDraft[],
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL ?? 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Extract GOALS football player cards from the screenshot. Return JSON only: {"players":[{"name":"","position":"","overall":0,"raw":""}],"notes":""}. If uncertain, keep raw text and omit fields.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'OCR this GOALS squad/player screen. Extract visible player names, positions and overalls.' },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ configured: true, error: await response.text(), players: [] }, { status: 502 });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text);
    return NextResponse.json({ configured: true, ...parsed });
  } catch (error) {
    return NextResponse.json({ error: String(error), players: [] }, { status: 500 });
  }
}
