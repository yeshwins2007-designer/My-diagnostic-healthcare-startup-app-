/**
 * Product identity in one place. Rename the business here and it changes
 * everywhere: page titles, the voice agent's introduction, printed cards.
 */
export const brand = {
  name: 'MEDWYN',
  /** Shown under the name. Deliberately not a speed claim. */
  tagline: 'The same trusted person, at your parents’ door, every month.',
  /**
   * The blueprint's one-line business. This is the sentence a technician says
   * at a doorstep and the sentence the voice agent opens with.
   */
  oneLiner:
    'We take care of regular blood tests for elderly parents at home. The same trained person visits each month, we explain the results in plain language, and we call the family as soon as anything looks wrong.',
  supportPhone: '+91 80 4718 2200',
  supportWhatsApp: '+91 80 4718 2200',
  emergencyNumber: '108',
  legalEntity: 'SwasthaSetu Health Services Pvt. Ltd.',
  /**
   * Contacts the app stores and the DPDP Act require (privacy policy, support
   * page, grievance officer). Replace with real, monitored ones before launch:
   * docs/store-launch.md lists them.
   */
  supportEmail: 'support@medwyn.in',
  privacyEmail: 'privacy@medwyn.in',
  grievanceOfficer: 'Grievance Officer, MEDWYN',
  registeredAddress: 'Registered office address to be added before launch',

  /**
   * What we are, and what we are not. This is not decoration: it defines what
   * we may legally claim, what we insure against, and what the voice agent is
   * allowed to say. Rendered verbatim on the public trust page.
   */
  weAre: [
    'A care-coordination and home-collection service',
    'Priced per test, with an optional Medwyn One membership',
    'Accountable for punctuality, sample handling, communication and follow-up',
    'A source of new patients for our partner labs',
  ],
  weAreNot: [
    'A pathology lab. Our NABL-accredited partner lab runs the tests',
    'An on-demand test-booking app',
    'Responsible for how accurate a result is. That sits with the accredited lab and its pathologist',
    'A price-comparison site. Families can choose between our accredited partner labs, but we don’t rank them on price or make them bid against each other',
  ],

  /**
   * Hardcoded onto every digital summary and every printed card. Not a
   * configurable string, and not something a page is allowed to omit.
   */
  disclaimer:
    'This is information, not a diagnosis. It does not replace consulting your physician. Results are produced and signed by our NABL-accredited partner laboratory.',
} as const;

export type Brand = typeof brand;
