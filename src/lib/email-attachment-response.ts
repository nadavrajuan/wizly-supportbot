import { NextResponse } from 'next/server';
import { getAttachmentBytes } from '@/lib/gmail';

export async function buildAttachmentResponse(
  messageId: string,
  attachmentId: string
): Promise<NextResponse> {
  const attachment = await getAttachmentBytes(messageId, attachmentId);
  if (!attachment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(attachment.data), {
    status: 200,
    headers: {
      'Content-Type': attachment.mimeType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
