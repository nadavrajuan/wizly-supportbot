import { getDb } from './db';
import fs from 'fs';
import path from 'path';

export function seedKnowledgeBase() {
  const db = getDb();
  const { count } = db
    .prepare('SELECT COUNT(*) as count FROM knowledge_entries')
    .get() as { count: number };

  if (count > 0) return;

  const candidates = ['docs/Wyzly support - Q&A.md', 'knowledge.md'];
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
  const lines = content.split('\n');

  let currentQ: string | null = null;
  let currentA: string[] = [];
  let inAnswer = false;

  function flush() {
    if (currentQ && currentA.length) {
      const unescape = (s: string) =>
        s.replace(/\\-/g, '-').replace(/\\>/g, '>').replace(/\s+/g, ' ').trim();
      entries.push({ question: unescape(currentQ), answer: unescape(currentA.join(' ')) });
    }
  }

  for (const line of lines) {
    // Q line: "N. Q \- text" or "N. Q - text"
    const qMatch = line.match(/^\d+\.\s+Q\s*\\?-\s*(.+)/);
    // A line: "   A \- text" or "   A - text"
    const aMatch = line.match(/^\s+A\s*\\?-\s*(.+)/);

    if (qMatch) {
      flush();
      currentQ = qMatch[1];
      currentA = [];
      inAnswer = false;
    } else if (aMatch && currentQ) {
      currentA = [aMatch[1]];
      inAnswer = true;
    } else if (inAnswer && line.trim() && !line.match(/^\d+\.\s+Q/)) {
      currentA.push(line.trim());
    }
  }
  flush();

  return entries;
}
