import { NextRequest, NextResponse } from 'next/server';
import { getAttachmentBytes } from '@/lib/gmail';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const { id: messageId, attachmentId } = await params;

  try {
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
  } catch (error) {
    console.error('Error fetching email attachment:', error);
    return NextResponse.json({ error: 'Failed to fetch attachment' }, { status: 500 });
  }
}
