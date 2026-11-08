/**
 * Each technician, as the families saw them: the after-visit check-in's two
 * answers, added up. On-time and gentle are counted only from clear yes or
 * no answers. A technician is flagged early, on a pattern rather than a
 * single bad morning: punctuality under 80% across five or more answers, or
 * any "not gentle" in their last ten visits.
 */

import { db } from '../db';

export interface TechnicianQuality {
  technicianId: string;
  name: string;
  answers: number;
  onTimeRate: number | null;
  gentleRate: number | null;
  flagged: boolean;
  reasons: string[];
}

const rate = (yes: number, no: number) => (yes + no === 0 ? null : yes / (yes + no));

export async function technicianQuality(since: Date): Promise<TechnicianQuality[]> {
  const technicians = await db.technician.findMany({
    where: { isActive: true },
    include: { user: true, feedback: { where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } } },
  });
  return technicians
    .map((t) => {
      const f = t.feedback;
      const onTime = rate(f.filter((x) => x.onTime === 'YES').length, f.filter((x) => x.onTime === 'NO').length);
      const gentle = rate(f.filter((x) => x.gentle === 'YES').length, f.filter((x) => x.gentle === 'NO').length);
      const reasons: string[] = [];
      const clearOnTime = f.filter((x) => x.onTime !== 'UNSURE').length;
      if (onTime !== null && clearOnTime >= 5 && onTime < 0.8) reasons.push(`on time in ${Math.round(onTime * 100)}% of visits`);
      if (f.slice(0, 10).some((x) => x.gentle === 'NO')) reasons.push('a family said not gentle in the last ten visits');
      return {
        technicianId: t.id,
        name: t.user.name,
        answers: f.length,
        onTimeRate: onTime,
        gentleRate: gentle,
        flagged: reasons.length > 0,
        reasons,
      };
    })
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.answers - a.answers);
}
