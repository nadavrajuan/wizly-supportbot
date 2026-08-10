'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { SanitizedEmailHtml } from '@/components/SanitizedEmailHtml';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EmailSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

interface EmailAttachment {
  attachmentId: string;
  mimeType: string;
  filename: string;
  contentId?: string;
  size: number;
}

interface EmailDetail extends EmailSummary {
  body: string;
  bodyHtml: string;
  to: string;
  messageId: string;
  attachments: EmailAttachment[];
  replyTo: string;
  replyToDisplay: string;
  replyCc?: string;
  replyCcDisplay?: string;
  isForwarded: boolean;
}

interface KnowledgeEntry {
  id: number;
  question: string;
  answer: string;
  source: string;
  created_at: string;
}

interface Settings {
  openai_model: string;
  has_openai_key: boolean;
  gmail_connected: boolean;
  gmail_email: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentUrl(messageId: string, attachmentId: string): string {
  return `/api/email/${messageId}/attachments/${attachmentId}`;
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from;
}

function extractName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.split('@')[0];
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

function SettingsModal({
  settings,
  onClose,
  onSaved,
}: {
  settings: Settings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(settings.openai_model);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    const body: Record<string, string> = { openai_model: model };
    if (apiKey) body.openai_api_key = apiKey;
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onSaved(); }, 1200);
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Gmail Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Gmail Account</label>
            {settings.gmail_connected ? (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                <span className="text-green-500">●</span>
                Connected: {settings.gmail_email}
              </div>
            ) : (
              <a
                href="/api/auth/gmail"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
                Connect Gmail Account
              </a>
            )}
          </div>

          {/* OpenAI Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              OpenAI API Key
              {settings.has_openai_key && (
                <span className="ml-2 text-xs text-green-600 font-normal">● Saved</span>
              )}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings.has_openai_key ? '••••••••••••••• (leave blank to keep)' : 'sk-...'}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4.1"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">e.g. gpt-4.1, gpt-4o, gpt-4.5-preview</p>
          </div>
        </div>

        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition"
          >
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add / Edit Knowledge Modal ───────────────────────────────────────────────

function KnowledgeModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: { id?: number; question: string; answer: string };
  onClose: () => void;
  onSave: (q: string, a: string) => Promise<void>;
}) {
  const [q, setQ] = useState(initial?.question ?? '');
  const [a, setA] = useState(initial?.answer ?? '');
  const [saving, setSaving] = useState(false);

  async function handle() {
    if (!q.trim() || !a.trim()) return;
    setSaving(true);
    await onSave(q.trim(), a.trim());
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{initial?.id ? 'Edit Entry' : 'New Knowledge Entry'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Question</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Customer question…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Answer</label>
            <textarea
              value={a}
              onChange={(e) => setA(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Support answer…"
            />
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button
            onClick={handle}
            disabled={saving || !q.trim() || !a.trim()}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition"
          >
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Inner (needs useSearchParams) ──────────────────────────────────

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [aiResponse, setAiResponse] = useState('');
  const [kbSearch, setKbSearch] = useState('');

  const [loadingEmails, setLoadingEmails] = useState(true);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const [gmailConnected, setGmailConnected] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddKB, setShowAddKB] = useState(false);
  const [editKB, setEditKB] = useState<KnowledgeEntry | null>(null);
  const [toast, setToast] = useState('');
  const [expandedKB, setExpandedKB] = useState<Set<number>>(new Set());

  const imageAttachments = useMemo(
    () => (selectedEmail?.attachments ?? []).filter((attachment) => attachment.mimeType.startsWith('image/')),
    [selectedEmail?.attachments]
  );

  const fileAttachments = useMemo(
    () => (selectedEmail?.attachments ?? []).filter((attachment) => !attachment.mimeType.startsWith('image/')),
    [selectedEmail?.attachments]
  );

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const fetchEmails = useCallback(async () => {
    setLoadingEmails(true);
    const res = await fetch('/api/emails');
    const data = await res.json();
    setGmailConnected(data.gmailConnected);
    setEmails(data.emails ?? []);
    setLoadingEmails(false);
  }, []);

  const fetchKnowledge = useCallback(async () => {
    const res = await fetch('/api/knowledge');
    setKnowledge(await res.json());
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await fetch('/api/settings');
    setSettings(await res.json());
  }, []);

  useEffect(() => {
    fetchEmails();
    fetchKnowledge();
    fetchSettings();
  }, [fetchEmails, fetchKnowledge, fetchSettings]);

  useEffect(() => {
    if (searchParams.get('gmail_connected') === '1') {
      showToast('Gmail account connected!');
      fetchSettings();
      fetchEmails();
    }
    if (searchParams.get('gmail_error')) {
      showToast('Gmail connection failed. Check your OAuth credentials.');
    }
  }, [searchParams, fetchSettings, fetchEmails]);

  async function selectEmail(summary: EmailSummary) {
    setAiResponse('');
    setLoadingEmail(true);

    const res = await fetch(`/api/email/${summary.id}`);
    const detail: EmailDetail = await res.json();
    setSelectedEmail(detail);
    setLoadingEmail(false);

    if (summary.isUnread) {
      await fetch(`/api/email/${summary.id}/mark-read`, { method: 'POST' });
      setEmails((prev) =>
        prev.map((e) => (e.id === summary.id ? { ...e, isUnread: false } : e))
      );
    }
  }

  async function generate() {
    if (!selectedEmail) return;
    setGenerating(true);
    setAiResponse('');
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: selectedEmail.subject, body: selectedEmail.body }),
    });
    const data = await res.json();
    if (data.error) {
      showToast(`Error: ${data.error}`);
    } else {
      setAiResponse(data.response);
    }
    setGenerating(false);
  }

  async function approve() {
    if (!selectedEmail || !aiResponse.trim()) return;
    setSending(true);

    try {
      const sendResponse = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailId: selectedEmail.id,
          subject: selectedEmail.subject,
          body: aiResponse,
          threadId: selectedEmail.threadId,
          inReplyTo: selectedEmail.messageId,
        }),
      });

      const sendData = await sendResponse.json();
      if (!sendResponse.ok) {
        showToast(`Error: ${sendData.error ?? 'Failed to send reply'}`);
        return;
      }

      const knowledgeResponse = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: selectedEmail.subject,
          answer: aiResponse,
          source: 'approved',
        }),
      });

      if (!knowledgeResponse.ok) {
        const knowledgeData = await knowledgeResponse.json();
        showToast(`Reply sent, but failed to save to knowledge base: ${knowledgeData.error ?? 'Unknown error'}`);
        return;
      }

      showToast('Reply sent and saved to knowledge base ✓');
      setAiResponse('');
      fetchKnowledge();
    } finally {
      setSending(false);
    }
  }

  function reject() {
    setAiResponse('');
  }

  async function deleteKB(id: number) {
    await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
    setKnowledge((prev) => prev.filter((e) => e.id !== id));
  }

  async function saveNewKB(question: string, answer: string) {
    const res = await fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer, source: 'manual' }),
    });
    const entry = await res.json();
    setKnowledge((prev) => [entry, ...prev]);
  }

  async function updateKB(id: number, question: string, answer: string) {
    const res = await fetch(`/api/knowledge/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer }),
    });
    const entry = await res.json();
    setKnowledge((prev) => prev.map((e) => (e.id === id ? entry : e)));
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  const filteredKB = knowledge.filter(
    (e) =>
      e.question.toLowerCase().includes(kbSearch.toLowerCase()) ||
      e.answer.toLowerCase().includes(kbSearch.toLowerCase())
  );

  const unreadCount = emails.filter((e) => e.isUnread).length;

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Modals */}
      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={() => { fetchSettings(); showToast('Settings saved'); }}
        />
      )}
      {showAddKB && (
        <KnowledgeModal
          onClose={() => setShowAddKB(false)}
          onSave={saveNewKB}
        />
      )}
      {editKB && (
        <KnowledgeModal
          initial={editKB}
          onClose={() => setEditKB(null)}
          onSave={(q, a) => updateKB(editKB.id, q, a)}
        />
      )}

      {/* Top Bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">🦉</span>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-none">Wyzly Support</h1>
            <p className="text-xs text-gray-400">Email management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEmails}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main 3-column layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* ─── Left: Email List ─────────────────────────────────────────────── */}
        <aside className="w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">
              Inbox
              {unreadCount > 0 && (
                <span className="ml-2 bg-indigo-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </span>
            {!gmailConnected && (
              <a
                href="/api/auth/gmail"
                className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded-lg transition font-medium"
              >
                Connect Gmail
              </a>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!gmailConnected ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-sm font-medium text-gray-700">Gmail not connected</p>
                <p className="text-xs text-gray-400 mt-1 mb-4">Connect your Gmail account in Settings to start managing support emails.</p>
                <a
                  href="/api/auth/gmail"
                  className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition font-medium"
                >
                  Connect Gmail
                </a>
              </div>
            ) : loadingEmails ? (
              <div className="flex items-center justify-center h-24">
                <div className="animate-spin w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full" />
              </div>
            ) : emails.length === 0 ? (
              <div className="text-center py-12 text-sm text-gray-400">No emails found</div>
            ) : (
              emails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => selectEmail(email)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-indigo-50 transition ${
                    selectedEmail?.id === email.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-xs truncate ${email.isUnread ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                      {extractName(email.from)}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(email.date)}</span>
                  </div>
                  <div className={`text-xs mt-0.5 truncate ${email.isUnread ? 'font-semibold text-gray-800' : 'text-gray-700'}`}>
                    {email.isUnread && <span className="inline-block w-1.5 h-1.5 bg-indigo-500 rounded-full mr-1.5 mb-0.5" />}
                    {email.subject}
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">{email.snippet}</div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ─── Middle: Email Detail + Response ─────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {!selectedEmail ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 p-8">
              <div className="text-6xl mb-4">📧</div>
              <p className="text-sm font-medium text-gray-600">Select an email to get started</p>
              <p className="text-xs text-gray-400 mt-1">Click any email on the left to view it and generate an AI response.</p>
            </div>
          ) : loadingEmail ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Email Header */}
              <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
                <h2 className="font-semibold text-gray-900 text-base truncate">{selectedEmail.subject}</h2>
                <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                  <span>
                    <span className="font-medium text-gray-700">From:</span> {selectedEmail.from}
                  </span>
                  <span>
                    <span className="font-medium text-gray-700">Date:</span> {formatDate(selectedEmail.date)}
                  </span>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto">
                {/* Email Body */}
                <div className="bg-white mx-6 mt-4 rounded-xl border border-gray-200 p-5">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Email</p>
                  {selectedEmail.bodyHtml ? (
                    <SanitizedEmailHtml
                      html={selectedEmail.bodyHtml}
                      fallback={selectedEmail.body || selectedEmail.snippet}
                      className="text-sm text-gray-800 leading-relaxed max-w-none [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_a]:text-indigo-600 [&_a]:underline"
                    />
                  ) : (
                    <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {selectedEmail.body || selectedEmail.snippet}
                    </div>
                  )}

                  {(imageAttachments.length > 0 || fileAttachments.length > 0) && (
                    <div className="mt-5 pt-5 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                        Attachments
                      </p>

                      {imageAttachments.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                          {imageAttachments.map((attachment) => (
                            <a
                              key={attachment.attachmentId}
                              href={attachmentUrl(selectedEmail.id, attachment.attachmentId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded-lg border border-gray-200 overflow-hidden hover:border-indigo-300 transition"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={attachmentUrl(selectedEmail.id, attachment.attachmentId)}
                                alt={attachment.filename}
                                className="w-full h-32 object-cover bg-gray-50"
                              />
                              <p className="text-xs text-gray-500 px-2 py-1.5 truncate">{attachment.filename}</p>
                            </a>
                          ))}
                        </div>
                      )}

                      {fileAttachments.length > 0 && (
                        <ul className="space-y-2">
                          {fileAttachments.map((attachment) => (
                            <li key={attachment.attachmentId}>
                              <a
                                href={attachmentUrl(selectedEmail.id, attachment.attachmentId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-indigo-600 hover:text-indigo-700 underline"
                              >
                                {attachment.filename}
                              </a>
                              <span className="text-xs text-gray-400 ml-2">
                                ({formatAttachmentSize(attachment.size)})
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* AI Response Section */}
                <div className="mx-6 mt-4 mb-6">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">AI Response</p>
                      <button
                        onClick={generate}
                        disabled={generating}
                        className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg transition font-medium flex items-center gap-1.5"
                      >
                        {generating ? (
                          <>
                            <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                            Generating…
                          </>
                        ) : (
                          <>
                            <span>✨</span>
                            {aiResponse ? 'Regenerate' : 'Generate Response'}
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-gray-500">
                      <span>
                        <span className="font-medium text-gray-700">To:</span> {selectedEmail.replyToDisplay}
                      </span>
                      {selectedEmail.replyCcDisplay && (
                        <span>
                          <span className="font-medium text-gray-700">Cc:</span> {selectedEmail.replyCcDisplay}
                        </span>
                      )}
                    </div>

                    {!aiResponse && !generating && (
                      <div className="text-sm text-gray-400 italic py-4 text-center">
                        Click "Generate Response" to create an AI-powered reply using your knowledge base.
                      </div>
                    )}

                    {aiResponse && (
                      <>
                        <textarea
                          value={aiResponse}
                          onChange={(e) => setAiResponse(e.target.value)}
                          rows={10}
                          className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed"
                        />

                        <div className="flex items-center justify-between mt-3">
                          <p className="text-xs text-gray-400">
                            Edit the response above if needed, then approve to send and save to knowledge base.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={reject}
                              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition"
                            >
                              <span className="text-base">✗</span>
                              Reject
                            </button>
                            <button
                              onClick={approve}
                              disabled={sending}
                              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 rounded-xl transition"
                            >
                              {sending ? (
                                <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                              ) : (
                                <span className="text-base">✓</span>
                              )}
                              {sending ? 'Sending…' : 'Approve & Send'}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ─── Right: Knowledge Base ───────────────────────────────────────── */}
        <aside className="w-80 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">
              Knowledge Base
              <span className="ml-2 text-xs text-gray-400 font-normal">{knowledge.length}</span>
            </span>
            <button
              onClick={() => setShowAddKB(true)}
              className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded-lg transition font-medium"
            >
              + Add
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-gray-100">
            <input
              type="text"
              value={kbSearch}
              onChange={(e) => setKbSearch(e.target.value)}
              placeholder="Search entries…"
              className="w-full text-xs px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredKB.length === 0 ? (
              <div className="text-center py-10 text-xs text-gray-400">
                {kbSearch ? 'No matching entries' : 'No entries yet'}
              </div>
            ) : (
              filteredKB.map((entry) => {
                const isExpanded = expandedKB.has(entry.id);
                return (
                  <div key={entry.id} className="border-b border-gray-50 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() =>
                          setExpandedKB((prev) => {
                            const next = new Set(prev);
                            if (isExpanded) next.delete(entry.id);
                            else next.add(entry.id);
                            return next;
                          })
                        }
                        className="text-xs font-medium text-gray-800 text-left hover:text-indigo-700 transition leading-snug flex-1"
                      >
                        {entry.question}
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setEditKB(entry)}
                          className="text-gray-300 hover:text-indigo-500 transition p-0.5"
                          title="Edit"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteKB(entry.id)}
                          className="text-gray-300 hover:text-red-500 transition p-0.5"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{entry.answer}</p>
                    )}

                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          entry.source === 'initial'
                            ? 'bg-gray-100 text-gray-500'
                            : entry.source === 'approved'
                            ? 'bg-green-50 text-green-600'
                            : 'bg-indigo-50 text-indigo-500'
                        }`}
                      >
                        {entry.source}
                      </span>
                      <span className="text-xs text-gray-300">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" /></div>}>
      <DashboardInner />
    </Suspense>
  );
}
