import { NextRequest } from 'next/server';
import { parseAttachmentRequest } from '@/lib/email-attachment-url';
import { buildAttachmentResponse } from '@/lib/email-attachment-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: messageId } = await params;
  const attachmentId = request.nextUrl.searchParams.get('attachmentId');
  const parsedRequest = parseAttachmentRequest(messageId, attachmentId);

  if (!parsedRequest) {
    return Response.json({ error: 'Missing attachmentId' }, { status: 400 });
  }

  try {
    return await buildAttachmentResponse(parsedRequest.messageId, parsedRequest.attachmentId);
  } catch (error) {
    console.error('Error fetching email attachment:', error);
    return Response.json({ error: 'Failed to fetch attachment' }, { status: 500 });
  }
}
