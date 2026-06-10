import { NextRequest, NextResponse } from 'next/server';
import { getEmail } from '@/lib/gmail';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const email = await getEmail(id);
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(email);
  } catch (err) {
    console.error('Error fetching email:', err);
    return NextResponse.json({ error: 'Failed to fetch email' }, { status: 500 });
  }
}
