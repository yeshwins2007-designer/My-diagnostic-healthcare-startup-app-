/**
 * The proof that carries a verified phone number from the code step to
 * account creation. Without it, account creation trusted whatever number
 * the form posted.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, { value: string }>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => jar.get(name),
    set: (name: string, value: string) => void jar.set(name, { value }),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const { issuePhoneProof, readPhoneProof, clearPhoneProof } = await import('@/lib/auth/phone-proof');

afterEach(() => {
  jar.clear();
  vi.useRealTimers();
});

describe('phone proof', () => {
  it('names the number that was verified, and nothing else', async () => {
    expect(await readPhoneProof()).toBeNull();
    await issuePhoneProof('+919845012345');
    expect(await readPhoneProof()).toBe('+919845012345');
  });

  it('is spent after use', async () => {
    await issuePhoneProof('+919845012345');
    await clearPhoneProof();
    expect(await readPhoneProof()).toBeNull();
  });

  it('cannot be edited to name another number', async () => {
    await issuePhoneProof('+919845012345');
    const [name, { value }] = [...jar.entries()][0];
    const [header, payload, signature] = value.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), sub: '+919800000000' }),
    ).toString('base64url');
    jar.set(name, { value: `${header}.${forged}.${signature}` });
    expect(await readPhoneProof()).toBeNull();
  });

  it('expires after 15 minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
    await issuePhoneProof('+919845012345');
    vi.setSystemTime(new Date('2026-10-13T08:16:00Z'));
    expect(await readPhoneProof()).toBeNull();
  });
});
