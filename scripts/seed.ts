/**
 * Demo seed.
 *
 * One zone, two labs (one deliberately microbiology-only so the routing
 * refusal is demonstrable), two technicians, twelve families, live bookings at
 * every stage of the SOP, and a released report with a critical value.
 *
 * Run: npm run db:push && npm run seed
 */

import { PrismaClient } from '@prisma/client';
import { encryptField, bookingReference } from '../lib/compliance/crypto';
import { ageBandFor, CHECKLIST_STEPS } from '../lib/enums';
import { paise, annualFromMonthly } from '../lib/money';
import { DEMO_ANCHOR, DEMO_ROUTE_POLYLINE } from '../lib/providers/maps';

const db = new PrismaClient();

/** Fixed "now" anchor so the demo always has a sensible today. */
const NOW = new Date();
const at = (dayOffset: number, hour: number, minute = 0): Date => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
};

async function wipe() {
  // Order matters: children before parents.
  const tables = [
    'auditLog', 'growthGateEvaluation', 'metricSnapshot', 'voiceConversation',
    'supportTicket', 'incident', 'followUpCall', 'criticalValueAlert',
    'reportParameter', 'report', 'consentRecord', 'visitRouteSummary',
    'locationPing', 'trackingSession', 'custodyHandoff', 'coldChainLog',
    'specimen', 'visitChecklistStep', 'bookingItem', 'ledgerEntry', 'payment',
    'paymentMandate', 'booking', 'subscription', 'route', 'fhirBundle',
    'careContext', 'abdmConsentArtefact', 'abhaAccount', 'patientAddress',
    'patient', 'familyMember', 'family', 'technician', 'waitlistEntry',
    'planPanel', 'plan', 'panelItem', 'panel', 'labRateCardEntry',
    'labAgreement', 'accreditationCheck', 'labAccreditation', 'labMember',
    'zone', 'lab', 'testDefinition', 'authSession', 'otpChallenge', 'user',
  ] as const;

  for (const table of tables) {
    // @ts-expect-error dynamic model access is intentional here
    await db[table].deleteMany({});
  }
}

async function main() {
  console.log('Clearing existing data…');
  await wipe();

  // --- catalogue ------------------------------------------------------------
  console.log('Seeding test catalogue…');

  const testSpecs = [
    { code: 'HBA1C', name: 'HbA1c (glycated haemoglobin)', discipline: 'CLINICAL_BIOCHEMISTRY', sampleType: 'WHOLE_BLOOD', tubeType: 'Lavender (EDTA)', fastingHours: 0, stabilityHours: 6, loincCode: '4548-4' },
    { code: 'GLU_F', name: 'Fasting blood glucose', discipline: 'CLINICAL_BIOCHEMISTRY', sampleType: 'PLASMA', tubeType: 'Grey (fluoride)', fastingHours: 10, stabilityHours: 3, loincCode: '1558-6' },
    { code: 'LIPID', name: 'Lipid profile', discipline: 'CLINICAL_BIOCHEMISTRY', sampleType: 'SERUM', tubeType: 'Yellow (SST)', fastingHours: 10, stabilityHours: 6, loincCode: '57698-3' },
    { code: 'CREAT', name: 'Serum creatinine', discipline: 'CLINICAL_BIOCHEMISTRY', sampleType: 'SERUM', tubeType: 'Yellow (SST)', fastingHours: 0, stabilityHours: 6, loincCode: '2160-0' },
    { code: 'UREA', name: 'Blood urea', discipline: 'CLINICAL_BIOCHEMISTRY', sampleType: 'SERUM', tubeType: 'Yellow (SST)', fastingHours: 0, stabilityHours: 6, loincCode: '3094-0' },
    { code: 'ELEC', name: 'Serum electrolytes', discipline: 'CLINICAL_BIOCHEMISTRY', sampleType: 'SERUM', tubeType: 'Yellow (SST)', fastingHours: 0, stabilityHours: 4, loincCode: '24326-1' },
    { code: 'CBC', name: 'Complete blood count', discipline: 'HAEMATOLOGY', sampleType: 'WHOLE_BLOOD', tubeType: 'Lavender (EDTA)', fastingHours: 0, stabilityHours: 6, loincCode: '58410-2' },
    { code: 'TSH', name: 'Thyroid stimulating hormone', discipline: 'IMMUNOASSAY', sampleType: 'SERUM', tubeType: 'Yellow (SST)', fastingHours: 0, stabilityHours: 8, loincCode: '3016-3' },
    { code: 'VITD', name: 'Vitamin D (25-OH)', discipline: 'IMMUNOASSAY', sampleType: 'SERUM', tubeType: 'Yellow (SST)', fastingHours: 0, stabilityHours: 8, loincCode: '1989-3' },
    { code: 'B12', name: 'Vitamin B12', discipline: 'IMMUNOASSAY', sampleType: 'SERUM', tubeType: 'Yellow (SST)', fastingHours: 0, stabilityHours: 8, loincCode: '2132-9' },
    { code: 'URINE_R', name: 'Urine routine examination', discipline: 'CLINICAL_PATHOLOGY', sampleType: 'URINE', tubeType: 'Urine container', fastingHours: 0, stabilityHours: 2, loincCode: '24357-6' },
    { code: 'URINE_CS', name: 'Urine culture and sensitivity', discipline: 'MICROBIOLOGY', sampleType: 'URINE', tubeType: 'Sterile container', fastingHours: 0, stabilityHours: 2, loincCode: '630-4' },
  ];

  const tests = Object.fromEntries(
    await Promise.all(
      testSpecs.map(async (t) => [t.code, await db.testDefinition.create({ data: t })] as const),
    ),
  );

  const baselinePanel = await db.panel.create({
    data: {
      code: 'ELDER_BASELINE',
      name: 'Elder Baseline Panel',
      description:
        'The hero product: complete blood count, fasting glucose, HbA1c, lipid profile, liver and kidney markers, and thyroid — one named panel, one price.',
      pricePaise: paise(1499),
      fastingHours: 10,
      sortOrder: 1,
      items: {
        create: ['CBC', 'GLU_F', 'HBA1C', 'LIPID', 'CREAT', 'UREA', 'TSH'].map((code) => ({
          testId: tests[code].id,
        })),
      },
    },
  });

  const comprehensivePanel = await db.panel.create({
    data: {
      code: 'ELDER_COMPREHENSIVE',
      name: 'Elder Comprehensive Panel',
      description:
        'Everything in the Baseline, plus vitamin D, B12, electrolytes and urine routine. Once a year.',
      pricePaise: paise(2499),
      fastingHours: 10,
      sortOrder: 2,
      items: {
        create: [
          'CBC', 'GLU_F', 'HBA1C', 'LIPID', 'CREAT', 'UREA', 'TSH', 'VITD', 'B12', 'ELEC', 'URINE_R',
        ].map((code) => ({ testId: tests[code].id })),
      },
    },
  });

  // --- plans ----------------------------------------------------------------
  console.log('Seeding plans…');

  const sathi = await db.plan.create({
    data: {
      code: 'SATHI',
      name: 'Sathi',
      tagline: 'Companion — a quarterly check, so nothing is missed',
      pricePaise: paise(799),
      annualPricePaise: annualFromMonthly(paise(799)),
      visitsPerMonth: 0.34,
      patientsCovered: 1,
      sortOrder: 1,
      panels: { create: [{ panelId: baselinePanel.id, perYear: 2 }] },
    },
  });

  const suraksha = await db.plan.create({
    data: {
      code: 'SURAKSHA',
      name: 'Suraksha',
      tagline: 'Protection — the same person every month, and a call after every report',
      pricePaise: paise(1799),
      annualPricePaise: annualFromMonthly(paise(1799)),
      visitsPerMonth: 1,
      patientsCovered: 1,
      isRecommended: true,
      includesPriority: true,
      sortOrder: 2,
      panels: {
        create: [
          { panelId: baselinePanel.id, perYear: 4 },
          { panelId: comprehensivePanel.id, perYear: 1 },
        ],
      },
    },
  });

  const parivaar = await db.plan.create({
    data: {
      code: 'PARIVAAR',
      name: 'Parivaar',
      tagline: 'Family — both parents, twice a month, with a named coordinator',
      pricePaise: paise(2999),
      annualPricePaise: annualFromMonthly(paise(2999)),
      visitsPerMonth: 2,
      patientsCovered: 2,
      includesPriority: true,
      includesPhysicianReview: true,
      sortOrder: 3,
      panels: {
        create: [
          { panelId: baselinePanel.id, perYear: 4 },
          { panelId: comprehensivePanel.id, perYear: 2 },
        ],
      },
    },
  });

  // --- labs -----------------------------------------------------------------
  console.log('Seeding partner labs…');

  const anchorLab = await db.lab.create({
    data: {
      name: 'Ananya Diagnostics',
      legalName: 'Ananya Diagnostics & Research Centre',
      contactName: 'Dr. Sudha Rao',
      contactPhone: '+919845100200',
      contactEmail: 'lab@ananyadiagnostics.example',
      addressLine: '212, 11th Main Road, 4th Block, Jayanagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560011',
      latitude: DEMO_ANCHOR.lat,
      longitude: DEMO_ANCHOR.lng,
      status: 'ACTIVE',
      capacityCeiling: 40,
      abdmMode: 'PLATFORM_FACILITATED',
      brandingConsent: true,
      submittedAt: at(-120, 10),
      activatedAt: at(-110, 15),
      accreditation: {
        create: {
          certificateNumber: 'MC-2417',
          scope:
            'CLINICAL_BIOCHEMISTRY,HAEMATOLOGY,CLINICAL_PATHOLOGY,IMMUNOASSAY',
          validFrom: at(-700, 0),
          validUntil: at(430, 0),
          certificateQrPayload: 'https://nabl-india.org/verify/MC-2417',
          hfrFacilityId: 'IN2910001234',
          supervisingPathologistName: 'Dr. Sudha Rao',
          supervisingPathologistReg: 'KMC/2004/18442',
          verificationState: 'PASSED',
        },
      },
    },
    include: { accreditation: true },
  });

  // Exists so the scope check has something real to refuse. Fully accredited,
  // fully active — just not for the disciplines we route.
  const microLab = await db.lab.create({
    data: {
      name: 'Sanjeevini Microbiology Centre',
      legalName: 'Sanjeevini Microbiology Centre LLP',
      contactName: 'Dr. Harish Kumar',
      contactPhone: '+919845100300',
      contactEmail: 'contact@sanjeevinimicro.example',
      addressLine: '48, 9th Cross, 3rd Block, Jayanagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560011',
      latitude: 12.9289,
      longitude: 77.5901,
      status: 'ACTIVE',
      capacityCeiling: 25,
      abdmMode: 'LAB_SELF',
      brandingConsent: false,
      activatedAt: at(-60, 12),
      accreditation: {
        create: {
          certificateNumber: 'MC-3902',
          scope: 'MICROBIOLOGY',
          validFrom: at(-400, 0),
          validUntil: at(320, 0),
          supervisingPathologistName: 'Dr. Harish Kumar',
          supervisingPathologistReg: 'KMC/2009/22105',
          verificationState: 'PASSED',
        },
      },
    },
  });

  // A pending application, so the ops verification queue is not empty.
  await db.lab.create({
    data: {
      name: 'Nele Path Labs',
      legalName: 'Nele Pathology Services Pvt Ltd',
      contactName: 'Meera Shetty',
      contactPhone: '+919845100400',
      contactEmail: 'meera@nelepath.example',
      addressLine: '77, 30th Cross, Banashankari 2nd Stage',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560070',
      latitude: 12.9255,
      longitude: 77.5697,
      status: 'SUBMITTED',
      capacityCeiling: 30,
      submittedAt: at(-3, 11),
      accreditation: {
        create: {
          certificateNumber: 'MC-5518',
          scope: 'CLINICAL_BIOCHEMISTRY,HAEMATOLOGY',
          validFrom: at(-200, 0),
          validUntil: at(160, 0),
          supervisingPathologistName: 'Dr. Anil Menon',
          supervisingPathologistReg: 'KMC/2011/31204',
          verificationState: 'NOT_STARTED',
        },
      },
    },
  });

  await db.labAgreement.create({
    data: {
      labId: anchorLab.id,
      version: 1,
      rateCardNote:
        'Fixed per-test processing rate at 30% below retail, reviewed every 6 months.',
      paymentTerms: 'Fortnightly settlement, every alternate Tuesday.',
      turnaroundCommitment:
        'Biochemistry and haematology by 6 PM same day; immunoassay within 24 hours.',
      referralProtection:
        'Existing doctor-referred and walk-in patients are never deprioritised for SwasthaSetu volume.',
      capacityCeilingNote: '40 samples per day; 24 hours notice required above that.',
      exclusivityNote:
        'SwasthaSetu routes all Jayanagar zone volume here. The lab remains free to serve anyone.',
      brandingNote:
        'Written permission granted to state "Processed at Ananya Diagnostics, NABL-accredited MC-2417".',
      exitNote:
        '60 days notice either side. Patient records remain with the lab; SwasthaSetu retains coordination records only.',
      status: 'SIGNED',
      signedByLabName: 'Dr. Sudha Rao',
      signedByPlatformName: 'SwasthaSetu Health Services Pvt. Ltd.',
      signedAt: at(-108, 16),
    },
  });

  // Cost per test at the partner rate.
  const labCosts: Record<string, number> = {
    HBA1C: 320, GLU_F: 45, LIPID: 340, CREAT: 70, UREA: 65, ELEC: 190,
    CBC: 180, TSH: 240, VITD: 780, B12: 690, URINE_R: 90, URINE_CS: 380,
  };
  for (const [code, rupees] of Object.entries(labCosts)) {
    await db.labRateCardEntry.create({
      data: { labId: anchorLab.id, testId: tests[code].id, costPaise: paise(rupees) },
    });
  }

  // --- zone -----------------------------------------------------------------
  const zone = await db.zone.create({
    data: {
      name: 'Jayanagar 4th Block',
      city: 'Bengaluru',
      centerLat: DEMO_ANCHOR.lat,
      centerLng: DEMO_ANCHOR.lng,
      radiusKm: 5,
      anchorLabId: anchorLab.id,
      sequence: 1,
    },
  });

  // --- people ---------------------------------------------------------------
  console.log('Seeding people…');

  const ops = await db.user.create({
    data: {
      phone: '+919845000001',
      name: 'Yeshwin (founder)',
      role: 'OPS',
      locale: 'en',
      email: 'ops@swasthasetu.example',
    },
  });

  await db.user.create({
    data: {
      phone: '+919845100200',
      name: 'Dr. Sudha Rao',
      role: 'LAB',
      locale: 'en',
      labMemberships: { create: [{ labId: anchorLab.id, role: 'OWNER' }] },
    },
  });

  await db.user.create({
    data: {
      phone: '+919845100300',
      name: 'Dr. Harish Kumar',
      role: 'LAB',
      locale: 'en',
      labMemberships: { create: [{ labId: microLab.id, role: 'OWNER' }] },
    },
  });

  const priyaUser = await db.user.create({
    data: { phone: '+919845000010', name: 'Priya Nair', role: 'TECHNICIAN', locale: 'kn' },
  });
  const priya = await db.technician.create({
    data: {
      userId: priyaUser.id,
      zoneId: zone.id,
      qualification: 'DMLT, 6 years — elderly venipuncture',
      hprId: 'HPR-KA-88213',
      languages: 'kn,en,hi,ta',
      policeVerifiedOn: at(-200, 10),
      hepatitisBVaccinatedOn: at(-380, 10),
      monthlySalaryPaise: paise(28000),
      perVisitBonusPaise: paise(40),
    },
  });

  const rameshUser = await db.user.create({
    data: { phone: '+919845000011', name: 'Ramesh Gowda', role: 'TECHNICIAN', locale: 'kn' },
  });
  const ramesh = await db.technician.create({
    data: {
      userId: rameshUser.id,
      zoneId: zone.id,
      qualification: 'DMLT, 3 years',
      languages: 'kn,en,te',
      policeVerifiedOn: at(-90, 10),
      hepatitisBVaccinatedOn: at(-95, 10),
      monthlySalaryPaise: paise(24000),
      perVisitBonusPaise: paise(40),
    },
  });

  // --- families -------------------------------------------------------------
  console.log('Seeding families and patients…');

  const familySpecs = [
    { caregiver: 'Anjali Iyer', phone: '+919845000101', locale: 'en', patient: 'Lakshmi Iyer', age: 74, sex: 'FEMALE', conditions: 'Type 2 diabetes, hypertension', medications: 'Metformin, Amlodipine', mobility: 'ASSISTED', line1: '304, Shanti Nivas, 22nd Main', landmark: 'Opposite Cool Joint, 4th Block', lat: 12.9271, lng: 77.5892, plan: suraksha, tech: priya, founding: true },
    { caregiver: 'Rahul Deshpande', phone: '+919845000102', locale: 'mr', patient: 'Vasant Deshpande', age: 81, sex: 'MALE', conditions: 'CKD stage 3, hypertension', medications: 'Telmisartan, Furosemide', mobility: 'HOUSEBOUND', line1: '11, Krishna Kripa, 9th Cross', landmark: 'Near Ashoka Pillar', lat: 12.9218, lng: 77.5828, plan: suraksha, tech: priya, founding: true },
    { caregiver: 'Fatima Sheikh', phone: '+919845000103', locale: 'ur', patient: 'Rizwana Sheikh', age: 69, sex: 'FEMALE', conditions: 'Hypothyroidism, osteoarthritis', medications: 'Thyroxine', mobility: 'INDEPENDENT', line1: '7B, Noor Manzil, 5th Block', landmark: 'Behind Jayanagar Bus Depot', lat: 12.9245, lng: 77.5931, plan: sathi, tech: priya, founding: true },
    { caregiver: 'Suresh Reddy', phone: '+919845000104', locale: 'te', patient: 'Padma Reddy', age: 77, sex: 'FEMALE', conditions: 'Type 2 diabetes, anaemia', medications: 'Glimepiride, Iron', mobility: 'ASSISTED', line1: '52, Sai Residency, 3rd Block', landmark: 'Next to Ganesha temple', lat: 12.9283, lng: 77.5851, plan: suraksha, tech: priya, founding: true },
    { caregiver: 'Nithya Raman', phone: '+919845000105', locale: 'ta', patient: 'Kamala Raman', age: 84, sex: 'FEMALE', conditions: 'Dementia, hypertension', medications: 'Donepezil, Losartan', mobility: 'HOUSEBOUND', line1: '18, Meenakshi Illam, 26th Main', landmark: 'Opposite the park gate', lat: 12.9196, lng: 77.5867, plan: parivaar, tech: priya, founding: true },
    { caregiver: 'Arjun Menon', phone: '+919845000106', locale: 'ml', patient: 'Gopalan Menon', age: 72, sex: 'MALE', conditions: 'Post-MI, dyslipidaemia', medications: 'Atorvastatin, Aspirin', mobility: 'INDEPENDENT', line1: '9, Kairali, 12th Main', landmark: 'Near Cool Joint circle', lat: 12.9259, lng: 77.5947, plan: suraksha, tech: ramesh, founding: false },
    { caregiver: 'Simran Kaur', phone: '+919845000107', locale: 'pa', patient: 'Harbans Singh', age: 79, sex: 'MALE', conditions: 'COPD, diabetes', medications: 'Metformin, inhalers', mobility: 'ASSISTED', line1: '3, Guru Nivas, 8th Cross', landmark: 'Near the gurudwara', lat: 12.9231, lng: 77.5794, plan: suraksha, tech: ramesh, founding: false },
    { caregiver: 'Debjani Bose', phone: '+919845000108', locale: 'bn', patient: 'Anima Bose', age: 76, sex: 'FEMALE', conditions: 'Hypothyroidism, osteoporosis', medications: 'Thyroxine, Calcium', mobility: 'INDEPENDENT', line1: '41, Basanti Bhavan, 15th Main', landmark: 'Beside the sweet shop', lat: 12.9204, lng: 77.5912, plan: sathi, tech: ramesh, founding: false },
    { caregiver: 'Kiran Patel', phone: '+919845000109', locale: 'gu', patient: 'Bhikhabhai Patel', age: 83, sex: 'MALE', conditions: 'CKD stage 4, anaemia', medications: 'Erythropoietin, Sevelamer', mobility: 'HOUSEBOUND', line1: '66, Anand Villa, 7th Block', landmark: 'Near the Jain temple', lat: 12.9172, lng: 77.5849, plan: parivaar, tech: ramesh, founding: false },
    { caregiver: 'Vikram Shetty', phone: '+919845000110', locale: 'kn', patient: 'Sharada Shetty', age: 71, sex: 'FEMALE', conditions: 'Prediabetes, vitamin D deficiency', medications: 'Cholecalciferol', mobility: 'INDEPENDENT', line1: '25, Tulsi Nilaya, 19th Main', landmark: 'Opposite the BDA complex', lat: 12.9287, lng: 77.5915, plan: sathi, tech: priya, founding: false },
    { caregiver: 'Manish Agarwal', phone: '+919845000111', locale: 'hi', patient: 'Kamla Agarwal', age: 68, sex: 'FEMALE', conditions: 'Hypertension', medications: 'Amlodipine', mobility: 'INDEPENDENT', line1: '14, Shubh Apartments, 24th Main', landmark: 'Near the Ayyappa temple', lat: 12.9241, lng: 77.5877, plan: suraksha, tech: priya, founding: false },
    { caregiver: 'Aditi Sharma', phone: '+919845000112', locale: 'hi', patient: 'Om Prakash Sharma', age: 86, sex: 'MALE', conditions: 'Parkinson’s, hypertension', medications: 'Levodopa, Ramipril', mobility: 'HOUSEBOUND', line1: '2, Vrindavan, 32nd Cross', landmark: 'Last house on the lane', lat: 12.9188, lng: 77.5824, plan: parivaar, tech: ramesh, founding: false },
  ];

  const created: {
    family: { id: string };
    patient: { id: string; name: string };
    address: { id: string };
    caregiver: { id: string; name: string };
    subscription: { id: string };
    tech: { id: string };
    spec: (typeof familySpecs)[number];
  }[] = [];

  for (const spec of familySpecs) {
    const caregiver = await db.user.create({
      data: { phone: spec.phone, name: spec.caregiver, role: 'CAREGIVER', locale: spec.locale },
    });

    const family = await db.family.create({
      data: {
        name: `${spec.patient.split(' ').slice(-1)[0]} family`,
        members: { create: [{ userId: caregiver.id, role: 'PRIMARY_CAREGIVER' }] },
      },
    });

    const patient = await db.patient.create({
      data: {
        familyId: family.id,
        name: spec.patient,
        ageYears: spec.age,
        ageBand: ageBandFor(spec.age),
        sex: spec.sex,
        conditions: spec.conditions,
        medications: spec.medications,
        mobility: spec.mobility,
        needsProxyConsent: spec.conditions.includes('Dementia'),
        careNotes: spec.conditions.includes('Dementia')
          ? 'Greet slowly and re-introduce yourself each visit. Daughter must be present.'
          : '',
      },
    });

    const address = await db.patientAddress.create({
      data: {
        patientId: patient.id,
        line1: spec.line1,
        landmark: spec.landmark,
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560011',
        latitude: spec.lat,
        longitude: spec.lng,
        zoneId: zone.id,
      },
    });

    const discount = spec.founding ? 40 : 0;
    const effective = Math.round(spec.plan.pricePaise * (1 - discount / 100));

    const subscription = await db.subscription.create({
      data: {
        familyId: family.id,
        patientId: patient.id,
        planId: spec.plan.id,
        status: 'ACTIVE',
        billingCycle: spec.founding ? 'ANNUAL' : 'MONTHLY',
        isFoundingMember: spec.founding,
        discountPercent: discount,
        effectivePricePaise: effective,
        assignedTechnicianId: spec.tech.id,
        startedAt: at(spec.founding ? -150 : -70, 10),
        currentPeriodEnd: at(20, 10),
        mandate: {
          create: {
            method: 'UPI_AUTOPAY',
            providerRef: `sub_sim_seed_${patient.id.slice(-6)}`,
            instrumentHint: `${spec.caregiver.split(' ')[0].toLowerCase()}@okhdfcbank`,
            maxAmountPaise: paise(5000),
            status: 'ACTIVE',
            authenticatedAt: at(spec.founding ? -150 : -70, 10),
          },
        },
      },
    });

    // ABHA on about half the patients — a realistic split for this age group,
    // and proof that the app works fine for the ones without.
    if (['Lakshmi Iyer', 'Gopalan Menon', 'Sharada Shetty', 'Kamla Agarwal', 'Anima Bose'].includes(spec.patient)) {
      const handle = spec.patient.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.');
      await db.abhaAccount.create({
        data: {
          patientId: patient.id,
          abhaNumber: `91-${String(1000 + created.length)}-${String(4000 + created.length * 7)}-${String(2000 + created.length * 3)}`,
          abhaAddress: `${handle}@sbx`,
          verifyMethod: 'MOBILE_OTP',
          kycStatus: 'VERIFIED',
          authorisedByUserId: caregiver.id,
          linkedAt: at(-40, 11),
        },
      });
    }

    created.push({ family, patient, address, caregiver, subscription, tech: spec.tech, spec });
  }

  // --- routes and bookings --------------------------------------------------
  console.log('Seeding routes and bookings…');

  const todayRoute = await db.route.create({
    data: {
      technicianId: priya.id,
      serviceDate: at(0, 0),
      status: 'STARTED',
      encodedPolyline: DEMO_ROUTE_POLYLINE,
      plannedDistanceKm: 8.4,
      startedAt: at(0, 6, 20),
    },
  });

  await db.route.create({
    data: {
      technicianId: ramesh.id,
      serviceDate: at(0, 0),
      status: 'PLANNED',
      encodedPolyline: DEMO_ROUTE_POLYLINE,
      plannedDistanceKm: 7.1,
    },
  });

  async function makeBooking(opts: {
    index: number;
    status: string;
    windowStartHour: number;
    dayOffset: number;
    arrived?: boolean;
    lateMinutes?: number;
    routeId?: string;
    panelId: string;
    fastingHours: number;
  }) {
    const c = created[opts.index];
    const windowStart = at(opts.dayOffset, opts.windowStartHour, 30);
    const windowEnd = new Date(windowStart.getTime() + 60 * 60_000);

    const booking = await db.booking.create({
      data: {
        reference: bookingReference(),
        familyId: c.family.id,
        patientId: c.patient.id,
        addressId: c.address.id,
        subscriptionId: c.subscription.id,
        zoneId: zone.id,
        labId: anchorLab.id,
        technicianId: c.tech.id,
        routeId: opts.routeId ?? null,
        status: opts.status,
        intakeChannel: opts.index % 4 === 0 ? 'WHATSAPP' : 'APP',
        windowStart,
        windowEnd,
        arrivedAt: opts.arrived
          ? new Date(windowStart.getTime() + (opts.lateMinutes ?? 12) * 60_000)
          : null,
        fastingRequired: opts.fastingHours > 0,
        fastingHours: opts.fastingHours,
        totalPaise: 0,
        items: { create: [{ panelId: opts.panelId, pricePaise: 0 }] },
        checklistSteps: {
          create: CHECKLIST_STEPS.map((step) => ({
            stepKey: step.key,
            sequence: step.sequence,
            isBlocking: step.blocking,
            completedAt:
              step.sequence <= stepsDoneFor(opts.status) ? at(opts.dayOffset, 6, 30 + step.sequence * 4) : null,
          })),
        },
      },
    });
    return { booking, c, windowStart, windowEnd };
  }

  function stepsDoneFor(status: string): number {
    switch (status) {
      case 'SCHEDULED': return 3;
      case 'EN_ROUTE': return 4;
      case 'ARRIVED': return 4;
      case 'COLLECTED': return 7;
      case 'IN_TRANSIT': return 7;
      case 'AT_LAB': return 8;
      case 'PROCESSING': return 8;
      case 'REPORTED': return 10;
      case 'CLOSED': return 11;
      default: return 1;
    }
  }

  // Today, on Priya's live route — this is what the tracking demo follows.
  const enRoute = await makeBooking({ index: 0, status: 'EN_ROUTE', windowStartHour: 6, dayOffset: 0, routeId: todayRoute.id, panelId: baselinePanel.id, fastingHours: 10 });
  await makeBooking({ index: 1, status: 'SCHEDULED', windowStartHour: 7, dayOffset: 0, routeId: todayRoute.id, panelId: baselinePanel.id, fastingHours: 10 });
  await makeBooking({ index: 3, status: 'SCHEDULED', windowStartHour: 8, dayOffset: 0, routeId: todayRoute.id, panelId: baselinePanel.id, fastingHours: 10 });

  // In transit, so the two-hour clock is visibly ticking in the ops console.
  const inTransit = await makeBooking({ index: 4, status: 'IN_TRANSIT', windowStartHour: 6, dayOffset: 0, arrived: true, lateMinutes: 8, routeId: todayRoute.id, panelId: comprehensivePanel.id, fastingHours: 10 });

  await db.specimen.create({
    data: {
      bookingId: inTransit.booking.id,
      barcode: 'SPC-240001',
      tubeType: 'Yellow (SST)',
      identifier1: inTransit.c.patient.name,
      identifier2: `Age ${inTransit.c.spec.age} · ${inTransit.booking.reference}`,
      labelledAtBedside: true,
      collectedAt: at(0, 6, 52),
      clockStartsAt: at(0, 6, 52),
      status: 'IN_TRANSIT',
      coldChainLogs: {
        create: [
          { temperatureC: 4.2, recordedAt: at(0, 6, 55), boxSealed: true },
          { temperatureC: 4.6, recordedAt: at(0, 7, 0), boxSealed: true },
          { temperatureC: 5.1, recordedAt: at(0, 7, 5), boxSealed: true },
        ],
      },
    },
  });

  // Yesterday: a completed visit that produced a released report with a
  // critical value, so the whole downstream protocol is demonstrable.
  const reported = await makeBooking({ index: 5, status: 'REPORTED', windowStartHour: 7, dayOffset: -1, arrived: true, lateMinutes: 20, panelId: baselinePanel.id, fastingHours: 10 });

  const yesterdaySpecimen = await db.specimen.create({
    data: {
      bookingId: reported.booking.id,
      barcode: 'SPC-239887',
      tubeType: 'Lavender (EDTA)',
      identifier1: reported.c.patient.name,
      identifier2: `Age ${reported.c.spec.age} · ${reported.booking.reference}`,
      labelledAtBedside: true,
      collectedAt: at(-1, 7, 48),
      clockStartsAt: at(-1, 7, 48),
      intakeAt: at(-1, 8, 51),
      status: 'PROCESSED',
      coldChainLogs: {
        create: [
          { temperatureC: 3.9, recordedAt: at(-1, 7, 50), boxSealed: true },
          { temperatureC: 4.4, recordedAt: at(-1, 8, 20), boxSealed: true },
          { temperatureC: 5.2, recordedAt: at(-1, 8, 50), boxSealed: true },
        ],
      },
    },
  });

  await db.custodyHandoff.create({
    data: {
      specimenId: yesterdaySpecimen.id,
      technicianId: ramesh.id,
      labId: anchorLab.id,
      receivedByName: 'Latha (intake desk)',
      elapsedMinutes: 63,
      isBreach: false,
      handedOverAt: at(-1, 8, 51),
    },
  });

  const report = await db.report.create({
    data: {
      bookingId: reported.booking.id,
      patientId: reported.c.patient.id,
      labId: anchorLab.id,
      status: 'RELEASED',
      overallBand: 'RED',
      pathologistName: 'Dr. Sudha Rao',
      pathologistReg: 'KMC/2004/18442',
      signedAt: at(-1, 18, 10),
      summaryText:
        'Two values are outside their reference range and one has been flagged by the laboratory as needing urgent medical attention. Please contact the treating physician.',
      summaryVerifiedByUserId: ops.id,
      summaryVerifiedAt: at(-1, 18, 40),
      releasedAt: at(-1, 18, 45),
      parameters: {
        create: [
          { testId: tests.HBA1C.id, valueEncrypted: encryptField('9.4'), unit: '%', refLow: 4, refHigh: 5.7, band: 'RED', isCritical: true },
          { testId: tests.GLU_F.id, valueEncrypted: encryptField('186'), unit: 'mg/dL', refLow: 70, refHigh: 100, band: 'YELLOW' },
          { testId: tests.CBC.id, valueEncrypted: encryptField('12.9'), unit: 'g/dL', refLow: 12, refHigh: 16, band: 'GREEN' },
          { testId: tests.LIPID.id, valueEncrypted: encryptField('188'), unit: 'mg/dL', refLow: 0, refHigh: 200, band: 'GREEN' },
          { testId: tests.CREAT.id, valueEncrypted: encryptField('1.1'), unit: 'mg/dL', refLow: 0.6, refHigh: 1.3, band: 'GREEN' },
          { testId: tests.TSH.id, valueEncrypted: encryptField('3.4'), unit: 'µIU/mL', refLow: 0.4, refHigh: 4.5, band: 'GREEN' },
        ],
      },
    },
  });

  await db.criticalValueAlert.create({
    data: {
      reportId: report.id,
      parameterName: 'HbA1c',
      status: 'OPEN',
      raisedAt: at(-1, 18, 12),
    },
  });

  await db.followUpCall.create({
    data: {
      reportId: report.id,
      bookingId: reported.booking.id,
      dueBy: at(0, 18, 45),
      status: 'PENDING',
    },
  });

  // A closed visit from last week, with the follow-up call actually done.
  const closed = await makeBooking({ index: 2, status: 'CLOSED', windowStartHour: 7, dayOffset: -8, arrived: true, lateMinutes: 5, panelId: baselinePanel.id, fastingHours: 10 });
  const closedReport = await db.report.create({
    data: {
      bookingId: closed.booking.id,
      patientId: closed.c.patient.id,
      labId: anchorLab.id,
      status: 'RELEASED',
      overallBand: 'GREEN',
      pathologistName: 'Dr. Sudha Rao',
      pathologistReg: 'KMC/2004/18442',
      signedAt: at(-8, 17, 30),
      summaryText: 'All parameters are within their normal reference ranges.',
      summaryVerifiedByUserId: ops.id,
      summaryVerifiedAt: at(-8, 17, 50),
      releasedAt: at(-8, 18, 0),
      parameters: {
        create: [
          { testId: tests.TSH.id, valueEncrypted: encryptField('2.8'), unit: 'µIU/mL', refLow: 0.4, refHigh: 4.5, band: 'GREEN' },
          { testId: tests.CBC.id, valueEncrypted: encryptField('13.4'), unit: 'g/dL', refLow: 12, refHigh: 16, band: 'GREEN' },
        ],
      },
    },
  });
  await db.followUpCall.create({
    data: {
      reportId: closedReport.id,
      bookingId: closed.booking.id,
      dueBy: at(-7, 18, 0),
      status: 'COMPLETED',
      completedAt: at(-7, 11, 20),
      placedByUserId: ops.id,
      whatWorriedYou: 'Whether the thyroid dose still suits her at this age.',
      whatWouldImprove: 'A printed copy each time — she likes to keep them in a file.',
    },
  });

  // Upcoming visits across the next fortnight, so the calendar is populated.
  for (let i = 6; i < created.length; i++) {
    await makeBooking({
      index: i,
      status: 'SCHEDULED',
      windowStartHour: 6 + (i % 3),
      dayOffset: (i % 9) + 1,
      panelId: i % 4 === 0 ? comprehensivePanel.id : baselinePanel.id,
      fastingHours: 10,
    });
  }

  // --- waitlist -------------------------------------------------------------
  await db.waitlistEntry.createMany({
    data: [
      { zoneId: zone.id, callerName: 'Prakash Rao', callerPhone: '+919845000201', patientName: 'Sarojini Rao', patientAge: 78, addressText: 'Whitefield, Bengaluru', latitude: 12.9698, longitude: 77.75, distanceKm: 18.4, note: 'Daughter in Dubai. Very keen. Told them we will call when we open the next zone.' },
      { zoneId: zone.id, callerName: 'Latha Krishnan', callerPhone: '+919845000202', patientName: 'K. Krishnan', patientAge: 82, addressText: 'Malleshwaram, Bengaluru', latitude: 13.0035, longitude: 77.5709, distanceKm: 8.9, note: 'Wanted to start immediately. Held — outside the radius.' },
      { zoneId: zone.id, callerName: 'Imran Pasha', callerPhone: '+919845000203', patientName: 'Nasreen Pasha', patientAge: 71, addressText: 'HSR Layout, Bengaluru', latitude: 12.9121, longitude: 77.6446, distanceKm: 6.7, note: 'Just outside. Would convert the day zone two opens.' },
    ],
  });

  // --- metric history -------------------------------------------------------
  console.log('Seeding metric history…');

  const weeks = 10;
  for (let w = weeks; w >= 0; w--) {
    const weekStart = new Date(NOW);
    weekStart.setDate(weekStart.getDate() - w * 7);
    weekStart.setHours(0, 0, 0, 0);

    // A business improving but not yet at the gate thresholds — which is what
    // makes the growth gates visibly refuse rather than trivially pass.
    const progress = (weeks - w) / weeks;
    await db.metricSnapshot.create({
      data: {
        zoneId: zone.id,
        weekStart,
        onTimeWithinWindowPct: Math.round((78 + progress * 14) * 10) / 10,
        sampleRejectionPct: Math.round((4.2 - progress * 2.6) * 10) / 10,
        monthThreeRetentionPct: Math.round((72 + progress * 16) * 10) / 10,
        visitsPerTechnicianPerMorning: Math.round((3.4 + progress * 2.4) * 10) / 10,
        followUpCallCompletionPct: Math.round((84 + progress * 14) * 10) / 10,
        referralSharePct: Math.round((6 + progress * 16) * 10) / 10,
        activeSubscribers: Math.round(4 + progress * 8),
        contributionMarginPaise: Math.round((-40000 + progress * 120000)),
      },
    });
  }

  console.log(`
Seed complete.

  Zone            ${zone.name} (${zone.radiusKm} km radius)
  Partner labs    ${anchorLab.name} MC-2417 (ACTIVE, biochem/haem/path/immuno)
                  ${microLab.name} MC-3902 (ACTIVE, MICROBIOLOGY only — for the routing refusal demo)
                  Nele Path Labs MC-5518 (SUBMITTED — sitting in the verification queue)
  Technicians     Priya Nair, Ramesh Gowda
  Families        ${created.length}
  Live booking    ${enRoute.booking.reference} — en route now, on Priya's route

Sign in with any of these phone numbers; the OTP is printed to this console.

  Ops / founder     +91 98450 00001
  Partner lab       +91 98451 00200
  Technician        +91 98450 00010  (Priya)
  Caregiver         +91 98450 00101  (Anjali Iyer — mother Lakshmi, 74)
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
