/**
 * The App Store and Google Play review account.
 *
 * Reviewers sign in with APP_REVIEW_PHONE and the fixed APP_REVIEW_CODE (see
 * lib/env.ts). This prepares what they find behind it: a family account with
 * one sample parent whose home is inside our first open zone, so booking
 * reaches the test catalogue instead of the waitlist. Safe on the production
 * database: it adds no labs, no bookings and no payments, and running it
 * again changes nothing.
 *
 *   APP_REVIEW_PHONE=+91XXXXXXXXXX npx tsx scripts/seed-review-account.ts
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const phone = process.env.APP_REVIEW_PHONE;
  if (!phone || !/^\+91[6-9]\d{9}$/.test(phone)) {
    throw new Error('Set APP_REVIEW_PHONE to the review number, e.g. +919XXXXXXXXX.');
  }

  const zone = await db.zone.findFirst({
    where: { isActive: true },
    orderBy: { sequence: 'asc' },
    include: { anchorLab: true },
  });
  if (!zone?.anchorLab) {
    throw new Error('No open zone with a partner lab yet. Reviewers would only see the waitlist.');
  }

  let user =
    (await db.user.findUnique({ where: { phone } })) ??
    (await db.user.create({ data: { phone, name: 'App Review', role: 'CAREGIVER' } }));
  if (user.role !== 'CAREGIVER' || user.name !== 'App Review') {
    throw new Error(`${phone} already belongs to another account. Choose a different review number.`);
  }
  // Reviewers check "Delete my account" with this account. Run this before
  // each submission and the next reviewer finds it working again. (Once
  // erased, the number is free and a fresh account is made above.)
  if (!user.isActive) {
    user = await db.user.update({ where: { id: user.id }, data: { isActive: true, deletionRequestedAt: null } });
  }

  const membership = await db.familyMember.findFirst({ where: { userId: user.id } });
  const familyId =
    membership?.familyId ??
    (
      await db.family.create({
        data: { name: 'Review family', members: { create: [{ userId: user.id, role: 'PRIMARY_CAREGIVER' }] } },
      })
    ).id;

  if ((await db.patient.count({ where: { familyId } })) === 0) {
    const lab = zone.anchorLab;
    await db.patient.create({
      data: {
        familyId,
        name: 'Sample Parent',
        ageYears: 74,
        sex: 'FEMALE',
        ageBand: 'BAND_70_80',
        conditions: 'Diabetes',
        careNotes: 'Sample profile for app review. No visit is ever made to this address.',
        addresses: {
          create: [
            {
              line1: 'Sample address for app review',
              landmark: `Near ${lab.name}`,
              city: lab.city,
              state: lab.state,
              pincode: lab.pincode,
              latitude: zone.centerLat,
              longitude: zone.centerLng,
              zoneId: zone.id,
            },
          ],
        },
      },
    });
  }

  console.log(`Review account ready: ${phone}, sample parent in ${zone.name}, ${zone.city}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
