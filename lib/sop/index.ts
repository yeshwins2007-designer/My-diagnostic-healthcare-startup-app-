/**
 * The SOP engine.
 *
 * This is the part of the product a funded on-demand competitor cannot copy by
 * spending money. Each rule turns one line of the operating blueprint into
 * something the software will not let you skip:
 *
 *   radiusGuard        never add a customer outside the radius "just this once"
 *   sampleClock        collection to lab intake within two hours
 *   coldChain          temperature logged and box sealed, or no handoff
 *   continuityRule     the same technician for the same family, every month
 *   labRouting         NABL scope, validity and capacity, checked every time
 *   criticalValue      call the caregiver now, and never interpret the value
 *   followUp           a family call within 24 hours of every report
 *   visitWindow        arrive inside the promised window, or call before it ends
 *   metrics            the six numbers reviewed every Monday
 *   growthGates        do not open zone two until zone one runs without you
 */

export * from './types';
export * from './radiusGuard';
export * from './sampleClock';
export * from './coldChain';
export * from './continuityRule';
export * from './labRouting';
export * from './criticalValue';
export * from './visitWindow';
export * from './metrics';
export * from './growthGates';
export * from './followUp';
