/**
 * Append-only, hash-chained audit log.
 *
 * Every row commits to the previous row's hash, so deleting or editing an
 * entry breaks the chain at a provable point. This is what makes "every
 * transaction generates an unalterable audit log" more than a slogan: GPS
 * positions, cold-box temperatures, custody handoffs, consent, every report
 * access, and every accreditation check land here.
 *
 * Writes are serialised through a promise chain because the hash of row N+1
 * depends on row N. Two concurrent appends would otherwise both read the same
 * tip and produce a fork.
 */

import crypto from 'node:crypto';
import { db } from '../db';
import { type AuditAction } from '../enums';

const GENESIS_HASH = '0'.repeat(64);

export interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId: string;
  actorUserId?: string | null;
  actorRole?: string;
  /** Never put a decrypted result value in here. */
  detail?: Record<string, unknown>;
}

function computeHash(input: {
  sequence: number;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  detailJson: string;
  occurredAt: Date;
  previousHash: string;
}): string {
  const canonical = [
    input.sequence,
    input.action,
    input.entityType,
    input.entityId,
    input.actorUserId ?? '',
    input.detailJson,
    input.occurredAt.toISOString(),
    input.previousHash,
  ].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// Serialises appends. Not a distributed lock — a multi-instance deployment
// should move this to a database-level advisory lock or a single writer.
let writeQueue: Promise<unknown> = Promise.resolve();

export async function audit(input: AuditInput): Promise<void> {
  const run = async () => {
    const tip = await db.auditLog.findFirst({
      orderBy: { sequence: 'desc' },
      select: { sequence: true, hash: true },
    });

    const sequence = (tip?.sequence ?? 0) + 1;
    const previousHash = tip?.hash ?? GENESIS_HASH;
    const detailJson = JSON.stringify(input.detail ?? {});
    const occurredAt = new Date();

    const hash = computeHash({
      sequence,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId: input.actorUserId ?? null,
      detailJson,
      occurredAt,
      previousHash,
    });

    await db.auditLog.create({
      data: {
        sequence,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? 'SYSTEM',
        detailJson,
        previousHash,
        hash,
        occurredAt,
      },
    });
  };

  writeQueue = writeQueue.then(run, run);
  await writeQueue;
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  /** Sequence number of the first row that does not match its recomputed hash. */
  brokenAtSequence?: number;
  reason?: string;
}

/**
 * Walks the whole chain and recomputes each hash. Exposed in the ops console
 * so the integrity claim can actually be demonstrated to an auditor rather
 * than asserted in a compliance document.
 */
export async function verifyChain(limit?: number): Promise<ChainVerification> {
  const rows = await db.auditLog.findMany({
    orderBy: { sequence: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  let previousHash = GENESIS_HASH;
  let expectedSequence = 1;

  for (const row of rows) {
    if (row.sequence !== expectedSequence) {
      return {
        valid: false,
        checked: expectedSequence - 1,
        brokenAtSequence: row.sequence,
        reason: `Sequence gap: expected ${expectedSequence}, found ${row.sequence}. A row was deleted.`,
      };
    }
    if (row.previousHash !== previousHash) {
      return {
        valid: false,
        checked: expectedSequence - 1,
        brokenAtSequence: row.sequence,
        reason: 'Previous-hash link does not match the preceding row.',
      };
    }

    const recomputed = computeHash({
      sequence: row.sequence,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorUserId: row.actorUserId,
      detailJson: row.detailJson,
      occurredAt: row.occurredAt,
      previousHash: row.previousHash,
    });

    if (recomputed !== row.hash) {
      return {
        valid: false,
        checked: expectedSequence - 1,
        brokenAtSequence: row.sequence,
        reason: 'Row contents do not match its stored hash. The row was edited.',
      };
    }

    previousHash = row.hash;
    expectedSequence += 1;
  }

  return { valid: true, checked: rows.length };
}

/** Everything ever recorded about one entity, oldest first. */
export function auditTrailFor(entityType: string, entityId: string) {
  return db.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { sequence: 'asc' },
  });
}
