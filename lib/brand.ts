/**
 * Product identity in one place. Rename the business here and it changes
 * everywhere — page titles, the voice agent's introduction, printed cards.
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
    'We look after the regular blood tests and health monitoring of elderly parents at home — the same trained person visits every month, results are explained in plain language, and the family gets a call the moment anything looks wrong.',
  supportPhone: '+91 80 4718 2200',
  supportWhatsApp: '+91 80 4718 2200',
  emergencyNumber: '108',
  legalEntity: 'SwasthaSetu Health Services Pvt. Ltd.',
  city: 'Bengaluru',

  /**
   * What we are, and what we are not. This is not decoration: it defines what
   * we may legally claim, what we insure against, and what the voice agent is
   * allowed to say. Rendered verbatim on the public trust page.
   */
  weAre: [
    'A care-coordination and home-collection service',
    'A recurring monitoring subscription',
    'Accountable for punctuality, sample handling, communication and follow-up',
    'A source of new patients for our partner labs',
  ],
  weAreNot: [
    'A pathology lab — our NABL-accredited partner lab is',
    'An on-demand transactional test-booking app',
    'Accountable for diagnostic accuracy — that sits with the accredited lab and its pathologist',
    'A price-comparison marketplace between labs',
  ],

  /**
   * Hardcoded onto every digital summary and every printed card. Not a
   * configurable string, and not something a page is allowed to omit.
   */
  disclaimer:
    'This is information, not a diagnosis. It does not replace consulting your physician. Results are produced and signed by our NABL-accredited partner laboratory.',
} as const;

export type Brand = typeof brand;
