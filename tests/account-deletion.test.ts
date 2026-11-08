/**
 * Deleting an account, against a real (throwaway) database: the account
 * closes at once, nothing identifying survives the grace period, and the
 * records the law requires (bookings, here) stay without the names.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB_FILE = path.resolve(import.meta.dirname, '../prisma/account-deletion-test.db');
process.env.DATABASE_URL = `file:${DB_FILE}`;

let deletion: typeof import('@/lib/account/deletion');
let db: typeof import('@/lib/db').db;

beforeAll(async () => {
  fs.rmSync(DB_FILE, { force: true });
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: `file:${DB_FILE}` },
    stdio: 'ignore',
  });
  deletion = await import('@/lib/account/deletion');
  ({ db } = await import('@/lib/db'));
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  fs.rmSync(DB_FILE, { force: true });
});

let n = 0;
async function family(opts: { status?: string } = {}) {
  n += 1;
  const user = await db.user.create({
    data: { phone: `+9197000${String(n).padStart(5, '0')}`, name: `Caregiver ${n}`, role: 'CAREGIVER', email: `c${n}@example.com` },
  });
  const fam = await db.family.create({
    data: { name: `Family ${n}`, members: { create: [{ userId: user.id, role: 'PRIMARY_CAREGIVER' }] } },
  });
  const patient = await db.patient.create({
    data: { familyId: fam.id, name: 'Kamala Raman', ageYears: 81, sex: 'FEMALE', ageBand: 'BAND_80_PLUS', careNotes: 'Hard of hearing', conditions: 'Diabetes', phone: '+919800000001' },
  });
  const address = await db.patientAddress.create({
    data: { patientId: patient.id, line1: '14, 11th Main', landmark: 'Green gate', city: 'Bengaluru', state: 'Karnataka', pincode: '560011', latitude: 12.931234, longitude: 77.583456 },
  });
  const start = new Date(Date.now() + 86_400_000);
  const booking = await db.booking.create({
    data: {
      reference: `SS-D${String(n).padStart(5, '0')}`,
      familyId: fam.id,
      patientId: patient.id,
      addressId: address.id,
      status: opts.status ?? 'REPORTED',
      windowStart: start,
      windowEnd: new Date(start.getTime() + 3_600_000),
    },
  });
  await db.authSession.create({ data: { userId: user.id, tokenId: `t${n}`, expiresAt: new Date(Date.now() + 86_400_000) } });
  await db.elderAccess.create({ data: { patientId: patient.id, tokenHash: `h${n}`, createdByUserId: user.id } });
  return { user, fam, patient, address, booking };
}

describe('deleting a family account', () => {
  it('closes it at once: signed out everywhere, unpaid bookings cancelled, our team told', async () => {
    const f = await family();
    const unpaid = await db.booking.create({
      data: { reference: `SS-U${n}`, familyId: f.fam.id, patientId: f.patient.id, addressId: f.address.id, status: 'AWAITING_PAYMENT', windowStart: new Date(), windowEnd: new Date() },
    });

    const r = await deletion.closeAccount(f.user.id);
    expect(r).toEqual({ ok: true, closed: true, message: 'Your account is closed.' });

    const user = await db.user.findUniqueOrThrow({ where: { id: f.user.id } });
    expect(user.isActive).toBe(false);
    expect(user.deletionRequestedAt).not.toBeNull();
    expect(await db.authSession.count({ where: { userId: f.user.id, revokedAt: null } })).toBe(0);
    expect((await db.booking.findUniqueOrThrow({ where: { id: unpaid.id } })).status).toBe('CANCELLED');
    expect(await db.supportTicket.count({ where: { raisedByUserId: f.user.id, category: 'ACCOUNT_DELETION' } })).toBe(1);
    expect(await deletion.closeAccount(f.user.id)).toEqual({ ok: false, message: 'This account is already closed.' });
  });

  it('waits while a visit is under way', async () => {
    const f = await family({ status: 'SCHEDULED' });
    const r = await deletion.closeAccount(f.user.id);
    expect(r.ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).isActive).toBe(true);
  });

  it('erases what identifies them after the grace period, and keeps the booking without the names', async () => {
    const f = await family();
    const past = new Date(Date.now() - (deletion.ERASE_AFTER_DAYS + 1) * 86_400_000);
    await deletion.closeAccount(f.user.id, past);

    expect(await deletion.eraseDueAccounts()).toBeGreaterThanOrEqual(1);

    const user = await db.user.findUniqueOrThrow({ where: { id: f.user.id } });
    expect(user).toMatchObject({ name: 'Deleted user', phone: `deleted:${f.user.id}`, email: null, passwordHash: null });
    expect(user.erasedAt).not.toBeNull();
    const patient = await db.patient.findUniqueOrThrow({ where: { id: f.patient.id } });
    expect(patient).toMatchObject({ name: 'Deleted', phone: null, careNotes: '', conditions: '', isActive: false });
    const address = await db.patientAddress.findUniqueOrThrow({ where: { id: f.address.id } });
    expect(address).toMatchObject({ line1: 'Deleted', landmark: '' });
    expect(address.latitude).not.toBe(12.931234); // coarsened to the area
    expect(await db.elderAccess.count({ where: { patientId: f.patient.id } })).toBe(0);
    expect(await db.familyMember.count({ where: { userId: f.user.id } })).toBe(0);
    // Kept, without the names: the record the law requires.
    expect(await db.booking.findUnique({ where: { id: f.booking.id } })).not.toBeNull();
  });

  it('does not erase before the grace period ends', async () => {
    const f = await family();
    await deletion.closeAccount(f.user.id);
    await deletion.eraseDueAccounts();
    expect((await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).name).toBe(f.user.name);
  });

  it('leaves the parents alone when another caregiver still looks after them', async () => {
    const f = await family();
    const sibling = await db.user.create({ data: { phone: '+919700099999', name: 'Sibling', role: 'CAREGIVER' } });
    await db.familyMember.create({ data: { familyId: f.fam.id, userId: sibling.id, role: 'CAREGIVER' } });
    await deletion.closeAccount(f.user.id, new Date(Date.now() - 40 * 86_400_000));
    await deletion.eraseDueAccounts();
    expect((await db.patient.findUniqueOrThrow({ where: { id: f.patient.id } })).name).toBe('Kamala Raman');
    expect((await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).name).toBe('Deleted user');
  });
});

describe('closing a partner account', () => {
  it('asks our partnerships team, and leaves the account working until then', async () => {
    const lab = await db.user.create({ data: { phone: '+919700088888', name: 'Lab owner', role: 'LAB' } });
    const r = await deletion.closeAccount(lab.id);
    expect(r).toMatchObject({ ok: true, closed: false });
    expect((await db.user.findUniqueOrThrow({ where: { id: lab.id } })).isActive).toBe(true);
    expect(await db.supportTicket.count({ where: { raisedByUserId: lab.id, category: 'ACCOUNT_DELETION' } })).toBe(1);
  });
});
