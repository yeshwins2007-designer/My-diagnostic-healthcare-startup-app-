import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { decryptBytes, encryptBytes } from '@/lib/compliance/crypto';
import { clientKey, rateLimit } from '@/lib/rate-limit';

/**
 * The lab's signed report, as a PDF.
 *
 * POST: the lab uploads it (owners and managers, an ACTIVE lab, an order in
 * processing or reported and not yet released to the family). GET: the lab
 * and MEDWYN operations read it back. Stored encrypted; every read is
 * audited, as every report read is.
 *
 * A route handler rather than a server action because a PDF is larger than
 * a server action's body limit. That also means checking the request's
 * origin here, which Next does for server actions automatically.
 */

const MAX_BYTES = 10 * 1024 * 1024;

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'report.pdf';
  const cleaned = base.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned || 'report'}.pdf`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  if (!rateLimit(clientKey(request, 'lab-pdf'), { limit: 30, windowSeconds: 600 }).allowed) {
    return NextResponse.json({ error: 'Too many uploads. Please wait a few minutes.' }, { status: 429 });
  }

  const user = await getSessionUser();
  if (!user || user.role !== 'LAB') return NextResponse.json({ error: 'Sign in as your laboratory.' }, { status: 401 });
  const membership = await db.labMember.findFirst({ where: { userId: user.id }, include: { lab: true } });
  if (!membership || membership.lab.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Your laboratory is not active.' }, { status: 403 });
  }
  if (!['OWNER', 'MANAGER'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only an owner or a manager can upload a signed report.' }, { status: 403 });
  }

  const booking = await db.booking.findFirst({
    where: { id: bookingId, labId: membership.labId },
    include: { reports: { select: { status: true } } },
  });
  if (!booking) return NextResponse.json({ error: 'That order is not routed to your laboratory.' }, { status: 404 });
  if (!['PROCESSING', 'REPORTED'].includes(booking.status) || booking.reports.some((r) => r.status === 'RELEASED')) {
    return NextResponse.json({ error: 'A report can be attached only while the order is being processed or awaiting release.' }, { status: 409 });
  }

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES + 64 * 1024) return NextResponse.json({ error: 'The file is larger than 10 MB.' }, { status: 413 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a PDF file.' }, { status: 400 });
  if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'The file must be a PDF of up to 10 MB.' }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  // Trust the bytes, not the name or the declared type.
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return NextResponse.json({ error: 'That file is not a PDF.' }, { status: 415 });
  }

  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const fileName = safeName(file.name);
  const cipher = new Uint8Array(encryptBytes(bytes));
  const doc = await db.reportDocument.upsert({
    where: { bookingId: booking.id },
    create: {
      bookingId: booking.id,
      labId: membership.labId,
      fileName,
      sizeBytes: bytes.length,
      sha256,
      cipher,
      uploadedByUserId: user.id,
    },
    update: { fileName, sizeBytes: bytes.length, sha256, cipher, uploadedByUserId: user.id },
  });
  await audit({
    action: 'LAB_REPORT_PDF_UPLOADED',
    entityType: 'Booking',
    entityId: booking.id,
    actorUserId: user.id,
    actorRole: 'LAB',
    detail: { fileName, sizeBytes: bytes.length, sha256 },
  });

  return NextResponse.json({ ok: true, fileName: doc.fileName, sizeBytes: doc.sizeBytes, uploadedAt: doc.updatedAt.toISOString() });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const user = await getSessionUser();
  if (!user || (user.role !== 'LAB' && user.role !== 'OPS')) return new NextResponse('Not found', { status: 404 });

  const doc = await db.reportDocument.findUnique({ where: { bookingId } });
  if (!doc) return new NextResponse('Not found', { status: 404 });
  if (user.role === 'LAB') {
    const member = await db.labMember.findFirst({ where: { userId: user.id, labId: doc.labId } });
    if (!member) return new NextResponse('Not found', { status: 404 });
  }

  const bytes = decryptBytes(Buffer.from(doc.cipher));
  await audit({
    action: 'REPORT_ACCESSED',
    entityType: 'Booking',
    entityId: bookingId,
    actorUserId: user.id,
    actorRole: user.role,
    detail: { surface: 'lab_signed_pdf' },
  });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${doc.fileName}"`,
      // A PDF from outside is shown sandboxed: no script, no same-origin access.
      'Content-Security-Policy': 'sandbox',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
