import { getDb } from './db';
import fs from 'fs';
import path from 'path';

export function seedKnowledgeBase() {
  const db = getDb();
  const { count } = db
    .prepare('SELECT COUNT(*) as count FROM knowledge_entries')
    .get() as { count: number };

  if (count > 0) return;

  const candidates = ['Wyzly support - Q&A.md', 'knowledge.md'];
  const mdPath = candidates
    .map((f) => path.join(process.cwd(), f))
    .find((p) => fs.existsSync(p));
  if (!mdPath) return;

  const content = fs.readFileSync(mdPath, 'utf-8');
  const entries = parseQA(content);

  const insert = db.prepare(
    'INSERT INTO knowledge_entries (question, answer, source) VALUES (?, ?, ?)'
  );
  const insertMany = db.transaction(
    (rows: { question: string; answer: string }[]) => {
      for (const row of rows) {
        insert.run(row.question, row.answer, 'initial');
      }
    }
  );

  insertMany(entries);
  console.log(`Seeded ${entries.length} knowledge base entries from MD file`);
}

function parseQA(content: string): { question: string; answer: string }[] {
  const entries: { question: string; answer: string }[] = [];

  // Match numbered items: "N. Q - ..." blocks
  const blocks = content.split(/\n(?=\d+\.\s+Q\s*[-–])/);

  for (const block of blocks) {
    const qMatch = block.match(/^\d+\.\s+Q\s*[-–]\s*([\s\S]*?)(?=\s+A\s*[-–])/i);
    const aMatch = block.match(/A\s*[-–]\s*([\s\S]+)$/i);
    if (qMatch && aMatch) {
      const question = qMatch[1].replace(/\s+/g, ' ').trim();
      const answer = aMatch[1].replace(/\s+/g, ' ').trim();
      if (question && answer) {
        entries.push({ question, answer });
      }
    }
  }

  return entries;
}
