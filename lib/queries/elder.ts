import 'server-only';
import { db } from '../db';

/**
 * The seeded patient Elder Mode shows in development and in an explicit demo,
 * so the mode is explorable from the landing page. Callers must check
 * allowDemoData first; a real deployment never reaches this.
 */
export async function demoElderPatientId(): Promise<string | null> {
  const first = await db.patient.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  return first?.id ?? null;
}
