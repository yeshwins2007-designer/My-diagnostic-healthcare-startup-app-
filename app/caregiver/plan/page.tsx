import { redirect } from 'next/navigation';

/** The old plans page. Plans are gone; Medwyn One lives at /caregiver/membership. */
export default function PlanPage() {
  redirect('/caregiver/membership');
}
