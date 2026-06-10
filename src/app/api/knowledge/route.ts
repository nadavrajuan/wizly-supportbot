import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const entries = db
    .prepare('SELECT * FROM knowledge_entries ORDER BY created_at DESC')
    .all();
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const { question, answer, source } = await req.json();
  if (!question?.trim() || !answer?.trim()) {
    return NextResponse.json({ error: 'Question and answer are required' }, { status: 400 });
  }

  const db = getDb();
  const result = db
    .prepare('INSERT INTO knowledge_entries (question, answer, source) VALUES (?, ?, ?)')
    .run(question.trim(), answer.trim(), source ?? 'manual');

  const entry = db
    .prepare('SELECT * FROM knowledge_entries WHERE id = ?')
    .get(result.lastInsertRowid);

  return NextResponse.json(entry, { status: 201 });
}
