/**
 * Enum-like value sets.
 *
 * The Prisma schema stores these as plain `String` columns so the same schema
 * runs on SQLite and Postgres unchanged (Prisma `enum` is not supported on
 * SQLite). The trade-off is that the database will not reject a bad value, so
 * every write boundary validates against the Zod schemas exported here.
 */

import { z } from 'zod';

/** Turns a readonly string tuple into a Zod enum without repeating the values. */
function set<const T extends readonly [string, ...string[]]>(values: T) {
  return { values, schema: z.enum(values) } as const;
}

// --- identity ---------------------------------------------------------------

export const UserRole = set(['CAREGIVER', 'TECHNICIAN', 'LAB', 'OPS']);
export type UserRole = (typeof UserRole.values)[number];

export const OtpPurpose = set(['LOGIN', 'ABHA_LINK', 'CONSENT', 'PATIENT_VERIFY']);
export const FamilyRole = set(['PRIMARY_CAREGIVER', 'SECONDARY_CAREGIVER']);

// --- patients ---------------------------------------------------------------

export const Sex = set(['MALE', 'FEMALE', 'OTHER']);

/**
 * The blueprint's three bands. 70-80 is the commercial centre of gravity:
 * high test frequency, high family anxiety, strong subscription fit. 80+ is
 * served well but capacity is never planned around it.
 */
export const AgeBand = set(['BAND_60_70', 'BAND_70_80', 'BAND_80_PLUS']);
export type AgeBand = (typeof AgeBand.values)[number];

export const Mobility = set(['INDEPENDENT', 'ASSISTED', 'HOUSEBOUND']);

/** Longer slots for frailer patients — gentle handling is not optional. */
export const VISIT_MINUTES_BY_MOBILITY: Record<string, number> = {
  INDEPENDENT: 20,
  ASSISTED: 30,
  HOUSEBOUND: 45,
};

export function ageBandFor(ageYears: number): AgeBand {
  if (ageYears >= 80) return 'BAND_80_PLUS';
  if (ageYears >= 70) return 'BAND_70_80';
  return 'BAND_60_70';
}

// --- ABDM -------------------------------------------------------------------

export const AbhaVerificationMethod = set(['AADHAAR_OTP', 'MOBILE_OTP', 'LINKED_EXISTING']);
export const AbhaKycStatus = set(['PENDING', 'VERIFIED', 'FAILED']);
export const AbdmConsentPurpose = set(['CAREMGT', 'DIAGNOSTICS', 'SELF']);
export const AbdmConsentStatus = set([
  'REQUESTED',
  'GRANTED',
  'DENIED',
  'EXPIRED',
  'REVOKED',
]);
export const CareContextStatus = set(['PENDING', 'LINKED', 'FAILED']);
export const FhirBundleStatus = set(['DRAFT', 'PUBLISHED', 'FAILED']);
export const AbdmMode = set(['LAB_SELF', 'PLATFORM_FACILITATED', 'NONE']);

// --- labs -------------------------------------------------------------------

export const LabStatus = set([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'VERIFIED',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
]);
export type LabStatus = (typeof LabStatus.values)[number];

export const LabMemberRole = set(['OWNER', 'MANAGER', 'INTAKE_DESK']);
export const VerificationState = set(['NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED']);
export const AgreementStatus = set(['DRAFT', 'SENT', 'SIGNED', 'SUPERSEDED']);

/**
 * NABL disciplines relevant to a medical laboratory. A lab's accredited scope
 * is matched against the discipline of every test before routing — the check
 * that stops an HbA1c reaching a microbiology-only lab.
 */
export const Discipline = set([
  'CLINICAL_BIOCHEMISTRY',
  'HAEMATOLOGY',
  'CLINICAL_PATHOLOGY',
  'MICROBIOLOGY',
  'IMMUNOASSAY',
  'MOLECULAR',
  'HISTOPATHOLOGY',
]);
export type Discipline = (typeof Discipline.values)[number];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  CLINICAL_BIOCHEMISTRY: 'Clinical Biochemistry',
  HAEMATOLOGY: 'Haematology',
  CLINICAL_PATHOLOGY: 'Clinical Pathology',
  MICROBIOLOGY: 'Microbiology',
  IMMUNOASSAY: 'Immunoassay',
  MOLECULAR: 'Molecular Biology',
  HISTOPATHOLOGY: 'Histopathology',
};

/** The seven items an ops reviewer must clear before a lab can go ACTIVE. */
export const AccreditationCheckKey = set([
  'CERTIFICATE_NUMBER_MATCHES_DIRECTORY',
  'QR_OR_URL_RESOLVES',
  'VALIDITY_IN_FUTURE',
  'SCOPE_COVERS_ROUTED_PANELS',
  'ADDRESS_MATCHES_PHYSICAL_SITE',
  'SIGNED_AGREEMENT_ON_FILE',
  'PATHOLOGIST_REGISTRATION_RECORDED',
]);
export type AccreditationCheckKey = (typeof AccreditationCheckKey.values)[number];

export const ACCREDITATION_CHECK_LABELS: Record<AccreditationCheckKey, string> = {
  CERTIFICATE_NUMBER_MATCHES_DIRECTORY:
    'Certificate number matches the NABL public directory entry for this lab name and city',
  QR_OR_URL_RESOLVES: 'Certificate QR code or verification URL resolves to this lab',
  VALIDITY_IN_FUTURE: 'Accreditation validity date is in the future',
  SCOPE_COVERS_ROUTED_PANELS: 'Accredited scope covers every discipline we intend to route',
  ADDRESS_MATCHES_PHYSICAL_SITE:
    'Registered address matches the physical site samples will actually reach',
  SIGNED_AGREEMENT_ON_FILE: 'Signed lab service agreement is on file',
  PATHOLOGIST_REGISTRATION_RECORDED:
    'Supervising pathologist name and council registration recorded',
};

// --- catalogue & commerce ---------------------------------------------------

export const SampleType = set(['WHOLE_BLOOD', 'SERUM', 'PLASMA', 'URINE']);
export const BillingCycle = set(['MONTHLY', 'ANNUAL']);
export const SubscriptionStatus = set([
  'PENDING',
  'ACTIVE',
  'PAUSED',
  'CANCELLED',
  'PAST_DUE',
]);
export const PaymentMethod = set([
  'UPI_AUTOPAY',
  'UPI_INTENT',
  'CARD',
  'NETBANKING',
  'CASH',
]);
export const MandateStatus = set([
  'PENDING',
  'AUTHENTICATED',
  'ACTIVE',
  'PAUSED',
  'REVOKED',
  'FAILED',
]);
export const PaymentStatus = set(['CREATED', 'PENDING', 'CAPTURED', 'FAILED', 'REFUNDED']);
export const LedgerAccount = set([
  'REVENUE',
  'LAB_COST',
  'TECHNICIAN_COST',
  'CONSUMABLES',
  'TRANSPORT',
  'SUPPORT',
  'REFUND',
]);
export type LedgerAccount = (typeof LedgerAccount.values)[number];

// --- the visit --------------------------------------------------------------

export const RouteStatus = set(['PLANNED', 'STARTED', 'COMPLETED', 'ABANDONED']);

export const BookingStatus = set([
  'REQUESTED',
  'SCHEDULED',
  'EN_ROUTE',
  'ARRIVED',
  'COLLECTED',
  'IN_TRANSIT',
  'AT_LAB',
  'PROCESSING',
  'REPORTED',
  'CLOSED',
  'CANCELLED',
  'RECOLLECTION_REQUIRED',
]);
export type BookingStatus = (typeof BookingStatus.values)[number];

/**
 * An elderly patient can be fully served without ever opening the app. These
 * channels are first-class, not a fallback.
 */
export const IntakeChannel = set(['APP', 'WHATSAPP', 'PHONE', 'VOICE_AGENT', 'FIELD_AGENT']);

export const SpecimenStatus = set([
  'COLLECTED',
  'IN_TRANSIT',
  'RECEIVED',
  'REJECTED',
  'PROCESSED',
]);

/** The blueprint's eleven-step booking-to-report SOP, in order. */
export const ChecklistStepKey = set([
  'BOOKING_CAPTURED',
  'SLOT_CONFIRMED_IN_WRITING',
  'FASTING_REMINDER_SENT',
  'ROUTE_FIXED_BEFORE_0630',
  'IDENTITY_CONFIRMED_AND_CONSENT',
  'LABELLED_AT_BEDSIDE',
  'VITALS_AND_COLD_BOX_SEALED',
  'HANDOVER_AT_LAB_INTAKE',
  'LAB_PROCESSED_AND_SIGNED',
  'REPORT_DELIVERED',
  'FOLLOW_UP_CALL_MADE',
]);
export type ChecklistStepKey = (typeof ChecklistStepKey.values)[number];

export const CHECKLIST_STEPS: {
  key: ChecklistStepKey;
  sequence: number;
  label: string;
  /** A blocking step physically prevents the next stage being recorded. */
  blocking: boolean;
  /** Which surface performs it. */
  actor: 'OPS' | 'TECHNICIAN' | 'LAB';
}[] = [
  { key: 'BOOKING_CAPTURED', sequence: 1, label: 'Booking captured with conditions, medications and landmark', blocking: false, actor: 'OPS' },
  { key: 'SLOT_CONFIRMED_IN_WRITING', sequence: 2, label: 'Sixty-minute slot confirmed in writing, with the technician’s name', blocking: false, actor: 'OPS' },
  { key: 'FASTING_REMINDER_SENT', sequence: 3, label: 'Evening-before reminder sent in plain language and the local language', blocking: false, actor: 'OPS' },
  { key: 'ROUTE_FIXED_BEFORE_0630', sequence: 4, label: 'Morning route fixed before 6:30 AM — densest cluster first', blocking: false, actor: 'TECHNICIAN' },
  { key: 'IDENTITY_CONFIRMED_AND_CONSENT', sequence: 5, label: 'Announced name, showed ID, confirmed patient identity aloud, took consent', blocking: true, actor: 'TECHNICIAN' },
  { key: 'LABELLED_AT_BEDSIDE', sequence: 6, label: 'Labelled at the bedside — two identifiers on every vial, never afterwards', blocking: true, actor: 'TECHNICIAN' },
  { key: 'VITALS_AND_COLD_BOX_SEALED', sequence: 7, label: 'Vitals recorded where included; cold box sealed with time and temperature logged', blocking: true, actor: 'TECHNICIAN' },
  { key: 'HANDOVER_AT_LAB_INTAKE', sequence: 8, label: 'Handover at the lab intake desk with a signed chain-of-custody slip', blocking: true, actor: 'TECHNICIAN' },
  { key: 'LAB_PROCESSED_AND_SIGNED', sequence: 9, label: 'Lab processed and the pathologist signed off on site', blocking: true, actor: 'LAB' },
  { key: 'REPORT_DELIVERED', sequence: 10, label: 'Report delivered digitally to the caregiver and as a printed large-font card', blocking: false, actor: 'OPS' },
  { key: 'FOLLOW_UP_CALL_MADE', sequence: 11, label: 'Follow-up call to the caregiver within 24 hours. Every time.', blocking: false, actor: 'OPS' },
];

// --- results ----------------------------------------------------------------

export const ReportStatus = set([
  'DRAFT',
  'PATHOLOGIST_SIGNED',
  'SUMMARY_PENDING_REVIEW',
  'RELEASED',
]);
export type ReportStatus = (typeof ReportStatus.values)[number];

export const StoplightBand = set(['GREEN', 'YELLOW', 'RED']);
export type StoplightBand = (typeof StoplightBand.values)[number];

export const AlertStatus = set(['OPEN', 'CAREGIVER_CALLED', 'CLOSED']);
export const FollowUpStatus = set(['PENDING', 'COMPLETED', 'MISSED']);

// --- consent ----------------------------------------------------------------

export const ConsentPurpose = set([
  'SAMPLE_COLLECTION',
  'REPORT_SHARING',
  'DATA_STORAGE',
  'MARKETING',
  'ABHA_LINKING',
  'VOICE_RECORDING',
]);
export type ConsentPurpose = (typeof ConsentPurpose.values)[number];

export const ConsentMethod = set([
  'WRITTEN',
  'VERBAL_RECORDED',
  'DIGITAL_TAP',
  'PROXY_FAMILY',
]);

// --- incidents & support ----------------------------------------------------

export const IncidentTier = set(['TIER_1_CRITICAL', 'TIER_2_MAJOR', 'TIER_3_MINOR']);
export type IncidentTier = (typeof IncidentTier.values)[number];

export const IncidentKind = set([
  'WRONG_RESULT',
  'SAMPLE_DEGRADED',
  'DATA_BREACH',
  'TRANSIT_DELAY',
  'VEHICLE_BREAKDOWN',
  'PR_ESCALATION',
  'RESCHEDULE',
  'COLD_CHAIN_BREACH',
  'SAMPLE_CLOCK_BREACH',
  'OTHER',
]);
export const IncidentStatus = set(['OPEN', 'ESCALATED', 'RESOLVED']);

export const TicketSource = set(['APP', 'PHONE', 'WHATSAPP', 'VOICE_AGENT']);
export const TicketCategory = set([
  'SCHEDULING',
  'BILLING',
  'REPORT_DELIVERY',
  'COMPLAINT',
  /** Raised automatically whenever the voice agent is asked something clinical. */
  'CLINICAL_HANDOFF',
]);
export const TicketPriority = set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const TicketStatus = set(['OPEN', 'IN_PROGRESS', 'RESOLVED']);

// --- audit & gates ----------------------------------------------------------

export const AuditAction = set([
  'USER_LOGIN',
  'CONSENT_GRANTED',
  'CONSENT_WITHDRAWN',
  'BOOKING_CREATED',
  'BOOKING_STATUS_CHANGED',
  'RADIUS_OVERRIDE',
  'WAITLISTED_OUT_OF_ZONE',
  'TECHNICIAN_SUBSTITUTED',
  'LOCATION_PING_RECORDED',
  'LOCATION_PING_REJECTED',
  'PINGS_PURGED',
  'COLD_CHAIN_LOGGED',
  'COLD_CHAIN_BREACH',
  'CUSTODY_HANDOFF',
  'SAMPLE_CLOCK_BREACH',
  'SPECIMEN_REJECTED',
  'REPORT_SIGNED',
  'REPORT_RELEASED',
  'REPORT_ACCESSED',
  'SUMMARY_VERIFIED',
  'CRITICAL_VALUE_RAISED',
  'CRITICAL_VALUE_CALLED',
  'FOLLOW_UP_CALL_COMPLETED',
  'LAB_SUBMITTED',
  'LAB_CHECK_RECORDED',
  'LAB_ACTIVATED',
  'LAB_SUSPENDED',
  'LAB_ROUTING_REFUSED',
  'ACCREDITATION_EXPIRED',
  'PAYMENT_CAPTURED',
  'MANDATE_STATUS_CHANGED',
  'ABHA_LINKED',
  'ABDM_CONSENT_GRANTED',
  'ABDM_CONSENT_REVOKED',
  'ABDM_REPORT_PUBLISHED',
  'VOICE_GUARDRAIL_TRIPPED',
  'VOICE_HANDED_OFF',
  'GROWTH_GATE_EVALUATED',
  'INCIDENT_RAISED',
  'DATA_EXPORTED',
  'DATA_ERASED',
]);
export type AuditAction = (typeof AuditAction.values)[number];

export const GrowthGateKey = set([
  'ZONE_TWO_UNLOCK',
  'MARKETPLACE_UNLOCK',
  'SECOND_TECHNICIAN',
]);
export type GrowthGateKey = (typeof GrowthGateKey.values)[number];
