import { NextRequest, NextResponse } from 'next/server';
import { generateSupportResponse } from '@/lib/ai';

export async function POST(req: NextRequest) {
  const { subject, body } = await req.json();
  if (!subject && !body) {
    return NextResponse.json({ error: 'Missing email content' }, { status: 400 });
  }

  try {
    const response = await generateSupportResponse(subject ?? '', body ?? '');
    return NextResponse.json({ response });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate response';
    console.error('AI error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
