export function attachmentApiPath(messageId: string, attachmentId: string): string {
  const query = new URLSearchParams({ attachmentId });
  return `/api/email/${encodeURIComponent(messageId)}/attachment?${query.toString()}`;
}

export function parseAttachmentRequest(
  messageId: string,
  attachmentIdFromQuery: string | null,
  attachmentIdFromPath?: string
): { messageId: string; attachmentId: string } | null {
  const attachmentId = attachmentIdFromQuery ?? attachmentIdFromPath ?? '';
  const decodedMessageId = decodeURIComponent(messageId);
  const decodedAttachmentId = decodeURIComponent(attachmentId);

  if (!decodedMessageId || !decodedAttachmentId) return null;

  return {
    messageId: decodedMessageId,
    attachmentId: decodedAttachmentId,
  };
}
