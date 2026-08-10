# Wyzly Supportbot — QA sanity checklist

Internal support desk for **info@wyzly.net**. An admin reviews incoming mail, generates AI draft replies, edits if needed, and approves to send.

## Access

| Item | Value |
|------|-------|
| **Dashboard URL** | https://wyzly-support.tacobrain.online/dashboard |
| **Login URL** | https://wyzly-support.tacobrain.online/ |
| **Password** | `9Tpuc05i25HJ+9Wx4WX2IQNIac0D4Ef3` |

**Before testing:** Settings should show **Connected: info@wyzly.net**. If not, ask engineering — Gmail OAuth must be connected first.

**Send test mail to:** `info@wyzly.net` (from a personal email, not the support mailbox).

Estimated time: ~10 minutes.

---

## 1. Login

- [ ] Open the login URL
- [ ] Enter the password above
- [ ] Dashboard loads (inbox + knowledge base panels)

---

## 2. Inbox

- [ ] Inbox lists messages (may be empty if no mail yet)
- [ ] Click **Refresh** after sending a new test email — it appears within a few seconds

**Send this test email** from your personal account:

```
To: info@wyzly.net
Subject: Wyzly test – screen time question
Body: Hi, how do I cancel my subscription?
```

---

## 3. Read an email

- [ ] Click the test message in the inbox
- [ ] Subject, sender, and body display correctly
- [ ] No error toasts or blank content

**Image test (optional but recommended):**

Send a second test email that includes:
- An inline screenshot pasted into the Gmail compose body
- A regular image file attached (e.g. `.png`)

Then in the dashboard:

- [ ] Inline image appears in the email body (rich view)
- [ ] Attached image appears in the **Attachments** section below the body
- [ ] Clicking an attachment opens the image in a new tab

---

## 4. Generate AI reply

- [ ] Click **Generate Response**
- [ ] Wait a few seconds — a draft appears in the textarea
- [ ] Draft addresses cancellation (uses the knowledge base)
- [ ] Tone is professional and mentions Wyzly / support team

**If Generate fails:** note the exact error message and stop — report to engineering.

---

## 5. Send a reply

- [ ] Optionally edit the draft (e.g. add “Test reply – please ignore”)
- [ ] Click **Approve & Send**
- [ ] Success toast appears (not an error)
- [ ] Check your **personal inbox** — reply from `info@wyzly.net` arrived
- [ ] Reply is in the **same email thread** (not a unrelated new email)
- [ ] Sender display name is **Wyzly Support** (or similar), not a personal name

**Forwarded email test (optional but recommended):**

1. From personal account **A**, send a customer-style email to personal account **B**
2. From account **B**, **Forward** that email to `info@wyzly.net`
3. In the dashboard, open the forwarded message
4. In the **AI Response** box header, confirm **To** shows account **A** (original sender)
5. Confirm **Cc** shows account **B** (forwarder)
6. Generate and **Approve & Send**
7. Confirm account **A** receives the reply and account **B** is CC'd

---

## 6. Knowledge base

- [ ] Right panel lists Q&A entries (~15 seeded entries)
- [ ] Expand an entry — question and answer text look correct
- [ ] After Approve & Send, a new **approved** entry may appear (optional check)

---

## 7. End-to-end loop (recommended single test)

If short on time, run only this:

1. From personal email → send a question to `info@wyzly.net`
2. Dashboard → **Refresh** → open the email
3. **Generate Response** → **Approve & Send**
4. Confirm reply received in personal inbox

This validates: Gmail in → AI draft → Gmail out.

---

## Optional extra cases

**Known topic (should use knowledge base):**

> How do I cancel my subscription?

**Unknown topic (AI should still reply politely):**

> Do you support Android?

---

## Troubleshooting

| Symptom | What to report |
|--------|----------------|
| Empty inbox after Refresh | Settings → is Gmail connected? Was mail sent **to** info@wyzly.net? |
| Generate fails | Copy error toast text |
| Approve & Send fails | Copy error toast text |
| Reply not received | Check spam; confirm send appeared to succeed in UI |
| Login fails | Confirm URL and password; try incognito |

---

## Out of scope for this checklist

- Google Workspace / DNS setup
- OAuth or Azure infrastructure
- Automated regression tests

Report failures with: step number, what you expected, what happened, screenshot if possible.
