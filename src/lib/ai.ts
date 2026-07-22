import OpenAI, { AzureOpenAI } from 'openai';
import { getDb } from './db';

function getSetting(key: string): string {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? '';
}

function isAzureProvider(): boolean {
  return process.env.AI_PROVIDER === 'azure';
}

function getOpenAIClient(): OpenAI {
  if (isAzureProvider()) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    if (!endpoint || !apiKey) {
      throw new Error('AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be set when AI_PROVIDER=azure.');
    }
    return new AzureOpenAI({
      endpoint,
      apiKey,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-10-21',
    });
  }
  const apiKey = getSetting('openai_api_key');
  if (!apiKey) throw new Error('OpenAI API key not configured. Go to Settings to add it.');
  return new OpenAI({ apiKey });
}

export function getModel(): string {
  if (isAzureProvider()) {
    return process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-chat';
  }
  return getSetting('openai_model') || 'gpt-4.1';
}

export async function generateSupportResponse(
  emailSubject: string,
  emailBody: string
): Promise<string> {
  const client = getOpenAIClient();
  const model = getModel();

  const db = getDb();
  const entries = db
    .prepare('SELECT question, answer FROM knowledge_entries ORDER BY id')
    .all() as { question: string; answer: string }[];

  const knowledgeBaseText = entries
    .map((e, i) => `${i + 1}. Q: ${e.question}\n   A: ${e.answer}`)
    .join('\n\n');

  const systemPrompt = `You are a friendly and helpful customer support agent for Wyzly, a parental control iOS app that manages children's screen time.

Use the knowledge base below to answer customer questions accurately. If the exact answer is in the knowledge base, use it. If not, provide a helpful response based on general context about the app.

Keep responses concise, warm, and professional. Always address the customer's specific concern. Sign off as "Wyzly Support Team".

KNOWLEDGE BASE:
${knowledgeBaseText}`;

  const userMessage = `Customer email subject: ${emailSubject}

Customer message:
${emailBody}

Please write a support response to this email.`;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_completion_tokens: 800,
    temperature: 0.4,
  });

  return completion.choices[0]?.message?.content ?? '';
}
