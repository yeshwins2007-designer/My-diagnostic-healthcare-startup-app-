/**
 * ABDM — Ayushman Bharat Digital Mission.
 *
 * Two roles, and the distinction matters legally:
 *
 *   HIU (Health Information User) — we request the patient's consent through
 *   the Consent Manager and pull their existing records, so the caregiver sees
 *   history and the technician knows conditions and medications before a visit.
 *
 *   HIP (Health Information Provider) — the *laboratory* creates the record;
 *   its pathologist signs it. We act as its technical integrator and link the
 *   care context to the patient's ABHA. Whether we do that at all is per-lab
 *   (`Lab.abdmMode`), because an established lab often already pushes to ABDM
 *   itself and double-publishing creates duplicate records in the patient's
 *   own account.
 *
 * ABHA is OPTIONAL and never blocks a booking. Most 70-80 year olds do not
 * have one. Gating service delivery on it would be both wrong and
 * commercially fatal.
 *
 * Production access requires M1/M2/M3 milestone certification against
 * sandbox.abdm.gov.in plus Health Facility Registry registration. That is a
 * compliance process; this code does not and cannot complete it. See
 * docs/abdm-go-live.md.
 */

import crypto from 'node:crypto';
import { env, providerMode } from '../../env';

export interface AbhaCreationChallenge {
  txnId: string;
  maskedMobile?: string;
  simulated: boolean;
}

export interface AbhaAccountResult {
  abhaNumber: string;
  abhaAddress: string;
  name: string;
  simulated: boolean;
}

export interface ConsentRequestResult {
  consentRequestId: string;
  simulated: boolean;
}

export interface ConsentArtefact {
  consentId: string;
  status: 'REQUESTED' | 'GRANTED' | 'DENIED' | 'EXPIRED' | 'REVOKED';
  hiTypes: string[];
  fromDate: Date;
  toDate: Date;
  expiresAt: Date;
  simulated: boolean;
}

export interface HealthRecordSummary {
  careContextReference: string;
  display: string;
  /** ISO date of the record. */
  date: string;
  hiType: string;
  source: string;
}

export interface AbdmProvider {
  readonly mode: 'live' | 'simulated';
  readonly environment: 'sandbox' | 'production';

  /** Step 1 of creating an ABHA on a parent's behalf. */
  initiateAbhaCreation(input: {
    method: 'AADHAAR_OTP' | 'MOBILE_OTP';
    identifier: string;
  }): Promise<AbhaCreationChallenge>;

  /** Step 2: verify the OTP and mint the account. */
  completeAbhaCreation(input: {
    txnId: string;
    otp: string;
    name: string;
  }): Promise<AbhaAccountResult>;

  /** Links an ABHA the patient already has. */
  verifyExistingAbha(input: {
    abhaNumberOrAddress: string;
    otp: string;
    txnId: string;
  }): Promise<AbhaAccountResult>;

  requestConsent(input: {
    abhaAddress: string;
    purpose: 'CAREMGT' | 'DIAGNOSTICS' | 'SELF';
    hiTypes: string[];
    fromDate: Date;
    toDate: Date;
  }): Promise<ConsentRequestResult>;

  fetchConsentArtefact(consentRequestId: string): Promise<ConsentArtefact | null>;

  fetchHealthRecords(consentId: string): Promise<HealthRecordSummary[]>;

  /** HIP side: make one of our visits discoverable in the patient's record. */
  linkCareContext(input: {
    abhaAddress: string;
    referenceNumber: string;
    display: string;
    patientName: string;
  }): Promise<{ linked: boolean; simulated: boolean; error?: string }>;

  publishDiagnosticReport(input: {
    abhaAddress: string;
    careContextReference: string;
    fhirBundleJson: string;
  }): Promise<{ published: boolean; simulated: boolean; error?: string }>;
}

const HI_TYPES = ['DiagnosticReport', 'OPConsultation', 'Prescription', 'HealthDocumentRecord'];

// --- simulated ---------------------------------------------------------------

/** 14 digits, rendered the way ABDM renders them: 91-XXXX-XXXX-XXXX. */
function simulatedAbhaNumber(seed: string): string {
  const digest = crypto.createHash('sha256').update(seed).digest('hex');
  const digits = digest.replace(/\D/g, '').padEnd(14, '0').slice(0, 14);
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10, 14)}`;
}

class SimulatedAbdmProvider implements AbdmProvider {
  readonly mode = 'simulated' as const;
  readonly environment = env.ABDM_ENV;

  async initiateAbhaCreation(input: {
    method: 'AADHAAR_OTP' | 'MOBILE_OTP';
    identifier: string;
  }): Promise<AbhaCreationChallenge> {
    const last4 = input.identifier.slice(-4);
    return {
      txnId: `txn_sim_${crypto.randomBytes(8).toString('hex')}`,
      maskedMobile: `XXXXXX${last4}`,
      simulated: true,
    };
  }

  async completeAbhaCreation(input: {
    txnId: string;
    otp: string;
    name: string;
  }): Promise<AbhaAccountResult> {
    const handle = input.name
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .trim()
      .replace(/\s+/g, '.');
    return {
      abhaNumber: simulatedAbhaNumber(input.txnId + input.name),
      // The sandbox suffix, not the production one — so a simulated account is
      // never mistaken for a real ABHA address.
      abhaAddress: `${handle}@sbx`,
      name: input.name,
      simulated: true,
    };
  }

  async verifyExistingAbha(input: {
    abhaNumberOrAddress: string;
    otp: string;
    txnId: string;
  }): Promise<AbhaAccountResult> {
    const isAddress = input.abhaNumberOrAddress.includes('@');
    return {
      abhaNumber: isAddress
        ? simulatedAbhaNumber(input.abhaNumberOrAddress)
        : input.abhaNumberOrAddress,
      abhaAddress: isAddress ? input.abhaNumberOrAddress : `${input.abhaNumberOrAddress.replace(/-/g, '')}@sbx`,
      name: '',
      simulated: true,
    };
  }

  async requestConsent(): Promise<ConsentRequestResult> {
    return {
      consentRequestId: `creq_sim_${crypto.randomBytes(8).toString('hex')}`,
      simulated: true,
    };
  }

  async fetchConsentArtefact(consentRequestId: string): Promise<ConsentArtefact> {
    const now = new Date();
    return {
      consentId: consentRequestId.replace('creq_', 'cons_'),
      // The simulator grants, so the happy path is demonstrable. Denial and
      // revocation are exercised from the ops console.
      status: 'GRANTED',
      hiTypes: ['DiagnosticReport'],
      fromDate: new Date(now.getFullYear() - 3, 0, 1),
      toDate: now,
      expiresAt: new Date(now.getTime() + 180 * 86_400_000),
      simulated: true,
    };
  }

  async fetchHealthRecords(): Promise<HealthRecordSummary[]> {
    const today = new Date();
    const monthsAgo = (n: number) =>
      new Date(today.getFullYear(), today.getMonth() - n, 12).toISOString().slice(0, 10);

    // Plausible prior records for an elderly diabetic patient. Titles only —
    // no values, because this provider must not become a source of them.
    return [
      {
        careContextReference: 'sim-cc-001',
        display: 'Diabetic panel — quarterly monitoring',
        date: monthsAgo(3),
        hiType: 'DiagnosticReport',
        source: 'Ananya Diagnostics (simulated)',
      },
      {
        careContextReference: 'sim-cc-002',
        display: 'Endocrinology consultation',
        date: monthsAgo(6),
        hiType: 'OPConsultation',
        source: 'Jayanagar Clinic (simulated)',
      },
      {
        careContextReference: 'sim-cc-003',
        display: 'Renal function panel',
        date: monthsAgo(9),
        hiType: 'DiagnosticReport',
        source: 'Ananya Diagnostics (simulated)',
      },
    ];
  }

  async linkCareContext() {
    return { linked: true, simulated: true };
  }

  async publishDiagnosticReport() {
    return { published: true, simulated: true };
  }
}

// --- live --------------------------------------------------------------------

class LiveAbdmProvider implements AbdmProvider {
  readonly mode = 'live' as const;
  readonly environment = env.ABDM_ENV;

  private get baseUrl(): string {
    return this.environment === 'production'
      ? 'https://abhasbx.abdm.gov.in'
      : 'https://dev.abdm.gov.in';
  }

  private tokenCache: { token: string; expiresAt: number } | null = null;

  /** ABDM sessions are short-lived; cache with a safety margin. */
  private async accessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.token;
    }

    const res = await fetch(`${this.baseUrl}/gateway/v0.5/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: env.ABDM_CLIENT_ID,
        clientSecret: env.ABDM_CLIENT_SECRET,
      }),
    });
    if (!res.ok) throw new Error(`ABDM session failed: ${res.status}`);

    const data = (await res.json()) as { accessToken: string; expiresIn: number };
    this.tokenCache = {
      token: data.accessToken,
      expiresAt: Date.now() + data.expiresIn * 1000,
    };
    return data.accessToken;
  }

  private async call<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
    const token = await this.accessToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'REQUEST-ID': crypto.randomUUID(),
        TIMESTAMP: new Date().toISOString(),
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      throw new Error(`ABDM ${path} failed (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async initiateAbhaCreation(input: {
    method: 'AADHAAR_OTP' | 'MOBILE_OTP';
    identifier: string;
  }): Promise<AbhaCreationChallenge> {
    const data = await this.call<{ txnId: string; mobileNumber?: string }>(
      '/abha/api/v3/enrollment/request/otp',
      {
        scope: ['abha-enrol'],
        loginHint: input.method === 'AADHAAR_OTP' ? 'aadhaar' : 'mobile',
        otpSystem: input.method === 'AADHAAR_OTP' ? 'aadhaar' : 'abdm',
        loginId: input.identifier,
      },
    );
    return { txnId: data.txnId, maskedMobile: data.mobileNumber, simulated: false };
  }

  async completeAbhaCreation(input: {
    txnId: string;
    otp: string;
    name: string;
  }): Promise<AbhaAccountResult> {
    const data = await this.call<{
      ABHAProfile: { ABHANumber: string; phrAddress: string[]; firstName: string; lastName: string };
    }>('/abha/api/v3/enrollment/enrol/byAadhaar', {
      authData: { authMethods: ['otp'], otp: { txnId: input.txnId, otpValue: input.otp } },
    });

    return {
      abhaNumber: data.ABHAProfile.ABHANumber,
      abhaAddress: data.ABHAProfile.phrAddress?.[0] ?? '',
      name: `${data.ABHAProfile.firstName} ${data.ABHAProfile.lastName}`.trim(),
      simulated: false,
    };
  }

  async verifyExistingAbha(input: {
    abhaNumberOrAddress: string;
    otp: string;
    txnId: string;
  }): Promise<AbhaAccountResult> {
    const data = await this.call<{
      ABHAProfile: { ABHANumber: string; phrAddress: string[]; name: string };
    }>('/abha/api/v3/profile/login/verify', {
      scope: ['abha-login', 'mobile-verify'],
      authData: { authMethods: ['otp'], otp: { txnId: input.txnId, otpValue: input.otp } },
    });

    return {
      abhaNumber: data.ABHAProfile.ABHANumber,
      abhaAddress: data.ABHAProfile.phrAddress?.[0] ?? input.abhaNumberOrAddress,
      name: data.ABHAProfile.name,
      simulated: false,
    };
  }

  async requestConsent(input: {
    abhaAddress: string;
    purpose: 'CAREMGT' | 'DIAGNOSTICS' | 'SELF';
    hiTypes: string[];
    fromDate: Date;
    toDate: Date;
  }): Promise<ConsentRequestResult> {
    const data = await this.call<{ consentRequestId: string }>(
      '/gateway/v0.5/consent-requests/init',
      {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        consent: {
          purpose: { text: 'Care Management', code: input.purpose },
          patient: { id: input.abhaAddress },
          hiTypes: input.hiTypes.filter((t) => HI_TYPES.includes(t)),
          permission: {
            accessMode: 'VIEW',
            dateRange: {
              from: input.fromDate.toISOString(),
              to: input.toDate.toISOString(),
            },
            dataEraseAt: new Date(Date.now() + 180 * 86_400_000).toISOString(),
            frequency: { unit: 'HOUR', value: 1, repeats: 0 },
          },
        },
      },
    );
    return { consentRequestId: data.consentRequestId, simulated: false };
  }

  async fetchConsentArtefact(consentRequestId: string): Promise<ConsentArtefact | null> {
    try {
      const data = await this.call<{
        consentRequest: {
          id: string;
          status: ConsentArtefact['status'];
          hiTypes: string[];
          permission: { dateRange: { from: string; to: string }; dataEraseAt: string };
        };
      }>(`/gateway/v0.5/consent-requests/${consentRequestId}`, null, 'GET');

      const c = data.consentRequest;
      return {
        consentId: c.id,
        status: c.status,
        hiTypes: c.hiTypes,
        fromDate: new Date(c.permission.dateRange.from),
        toDate: new Date(c.permission.dateRange.to),
        expiresAt: new Date(c.permission.dataEraseAt),
        simulated: false,
      };
    } catch {
      return null;
    }
  }

  async fetchHealthRecords(consentId: string): Promise<HealthRecordSummary[]> {
    const data = await this.call<{
      entries: { careContextReference: string; display: string; date: string; hiType: string; source: string }[];
    }>('/gateway/v0.5/health-information/cm/request', {
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      hiRequest: { consent: { id: consentId } },
    });
    return data.entries ?? [];
  }

  async linkCareContext(input: {
    abhaAddress: string;
    referenceNumber: string;
    display: string;
    patientName: string;
  }) {
    try {
      await this.call('/gateway/v0.5/links/link/add-contexts', {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        link: {
          accessToken: input.abhaAddress,
          patient: {
            referenceNumber: input.referenceNumber,
            display: input.patientName,
            careContexts: [
              { referenceNumber: input.referenceNumber, display: input.display },
            ],
          },
        },
      });
      return { linked: true, simulated: false };
    } catch (error) {
      return {
        linked: false,
        simulated: false,
        error: error instanceof Error ? error.message : 'Care context link failed',
      };
    }
  }

  async publishDiagnosticReport(input: {
    abhaAddress: string;
    careContextReference: string;
    fhirBundleJson: string;
  }) {
    try {
      await this.call('/gateway/v0.5/health-information/transfer', {
        pageNumber: 1,
        pageCount: 1,
        transactionId: crypto.randomUUID(),
        entries: [
          {
            content: input.fhirBundleJson,
            media: 'application/fhir+json',
            careContextReference: input.careContextReference,
          },
        ],
      });
      return { published: true, simulated: false };
    } catch (error) {
      return {
        published: false,
        simulated: false,
        error: error instanceof Error ? error.message : 'Publish failed',
      };
    }
  }
}

let cached: AbdmProvider | null = null;

export function getAbdmProvider(): AbdmProvider {
  if (!cached) {
    cached =
      providerMode.abdm === 'live' ? new LiveAbdmProvider() : new SimulatedAbdmProvider();
  }
  return cached;
}

/** ABHA numbers are 14 digits, conventionally shown as 91-XXXX-XXXX-XXXX. */
export function isValidAbhaNumber(value: string): boolean {
  return /^\d{2}-\d{4}-\d{4}-\d{4}$/.test(value.trim()) || /^\d{14}$/.test(value.replace(/\D/g, ''));
}

export function formatAbhaNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) return value;
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10, 14)}`;
}

export function isValidAbhaAddress(value: string): boolean {
  return /^[a-z0-9._]{3,}@(abdm|sbx)$/i.test(value.trim());
}
