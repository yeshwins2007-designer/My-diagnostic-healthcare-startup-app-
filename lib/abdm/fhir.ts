/**
 * FHIR R4 DiagnosticReport bundles for ABDM.
 *
 * The bundle is built from the *pathologist-signed* report and nothing else.
 * It is never assembled from a draft, and never from an AI-generated summary —
 * what goes into a patient's national health record is the laboratory's signed
 * output, attributed to the laboratory and its pathologist.
 */

import { decryptField } from '../compliance/crypto';

export interface ReportForFhir {
  id: string;
  signedAt: Date | null;
  pathologistName: string | null;
  pathologistReg: string | null;
  patient: { id: string; name: string; ageYears: number; sex: string };
  lab: { id: string; name: string; hfrFacilityId?: string | null };
  parameters: {
    id: string;
    valueEncrypted: string;
    unit: string;
    refLow: number | null;
    refHigh: number | null;
    test: { code: string; name: string; loincCode: string | null };
  }[];
}

const SEX_TO_FHIR: Record<string, string> = {
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other',
};

function urn(id: string): string {
  return `urn:uuid:${id}`;
}

export function buildDiagnosticReportBundle(report: ReportForFhir): Record<string, unknown> {
  const now = new Date().toISOString();
  const effective = (report.signedAt ?? new Date()).toISOString();

  const observations = report.parameters.map((param) => {
    // Values are encrypted at rest; they are decrypted only here, at the
    // moment of building a bundle the patient has consented to receive.
    const raw = decryptField(param.valueEncrypted);
    const numeric = Number(raw);

    return {
      fullUrl: urn(param.id),
      resource: {
        resourceType: 'Observation',
        id: param.id,
        status: 'final',
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'laboratory',
                display: 'Laboratory',
              },
            ],
          },
        ],
        code: {
          coding: [
            param.test.loincCode
              ? {
                  system: 'http://loinc.org',
                  code: param.test.loincCode,
                  display: param.test.name,
                }
              : {
                  system: 'https://swasthasetu.example/tests',
                  code: param.test.code,
                  display: param.test.name,
                },
          ],
          text: param.test.name,
        },
        subject: { reference: urn(report.patient.id), display: report.patient.name },
        effectiveDateTime: effective,
        issued: effective,
        performer: [{ reference: urn(report.lab.id), display: report.lab.name }],
        ...(Number.isFinite(numeric)
          ? { valueQuantity: { value: numeric, unit: param.unit, system: 'http://unitsofmeasure.org' } }
          : { valueString: raw }),
        ...(param.refLow !== null || param.refHigh !== null
          ? {
              referenceRange: [
                {
                  ...(param.refLow !== null ? { low: { value: param.refLow, unit: param.unit } } : {}),
                  ...(param.refHigh !== null ? { high: { value: param.refHigh, unit: param.unit } } : {}),
                },
              ],
            }
          : {}),
      },
    };
  });

  return {
    resourceType: 'Bundle',
    id: report.id,
    type: 'document',
    timestamp: now,
    meta: {
      lastUpdated: now,
      profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle'],
    },
    entry: [
      {
        fullUrl: urn(`composition-${report.id}`),
        resource: {
          resourceType: 'Composition',
          id: `composition-${report.id}`,
          status: 'final',
          type: {
            coding: [
              {
                system: 'https://projecteka.in/sct',
                code: '721981007',
                display: 'Diagnostic Report',
              },
            ],
          },
          subject: { reference: urn(report.patient.id), display: report.patient.name },
          date: effective,
          // Attribution sits with the laboratory and its pathologist, never
          // with the coordination platform.
          author: [{ reference: urn(report.lab.id), display: report.lab.name }],
          title: 'Diagnostic Report',
          ...(report.pathologistName
            ? {
                attester: [
                  {
                    mode: 'legal',
                    time: effective,
                    party: {
                      display: `${report.pathologistName}${report.pathologistReg ? ` (${report.pathologistReg})` : ''}`,
                    },
                  },
                ],
              }
            : {}),
          section: [
            {
              title: 'Diagnostic Report',
              entry: report.parameters.map((p) => ({ reference: urn(p.id) })),
            },
          ],
        },
      },
      {
        fullUrl: urn(report.patient.id),
        resource: {
          resourceType: 'Patient',
          id: report.patient.id,
          name: [{ text: report.patient.name }],
          gender: SEX_TO_FHIR[report.patient.sex] ?? 'unknown',
        },
      },
      {
        fullUrl: urn(report.lab.id),
        resource: {
          resourceType: 'Organization',
          id: report.lab.id,
          name: report.lab.name,
          ...(report.lab.hfrFacilityId
            ? {
                identifier: [
                  {
                    system: 'https://facility.abdm.gov.in',
                    value: report.lab.hfrFacilityId,
                  },
                ],
              }
            : {}),
        },
      },
      {
        fullUrl: urn(`diagnostic-${report.id}`),
        resource: {
          resourceType: 'DiagnosticReport',
          id: `diagnostic-${report.id}`,
          status: 'final',
          code: { text: 'Laboratory report' },
          subject: { reference: urn(report.patient.id) },
          effectiveDateTime: effective,
          issued: effective,
          performer: [{ reference: urn(report.lab.id) }],
          result: report.parameters.map((p) => ({ reference: urn(p.id) })),
        },
      },
      ...observations,
    ],
  };
}
