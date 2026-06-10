import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM knowledge_entries WHERE id = ?')
    .run(Number(params.id));

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { question, answer } = await req.json();
  if (!question?.trim() || !answer?.trim()) {
    return NextResponse.json({ error: 'Question and answer are required' }, { status: 400 });
  }

  const db = getDb();
  db.prepare('UPDATE knowledge_entries SET question = ?, answer = ? WHERE id = ?')
    .run(question.trim(), answer.trim(), Number(params.id));

  const entry = db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(Number(params.id));
  return NextResponse.json(entry);
}
