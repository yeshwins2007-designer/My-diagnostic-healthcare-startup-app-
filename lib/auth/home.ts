/**
 * The traffic controller: where each kind of account lands after signing in.
 *
 * One table, used by every sign-in path (phone code, email and password,
 * passkey) and by the page guards when someone opens a page that is not
 * theirs. Adding a role is one line here, not scattered maps that drift apart.
 * (components/site-header.tsx keeps its own copy of this table: it renders on
 * the family pages, which this change deliberately leaves untouched.)
 *
 * The family app and the partner apps are separate trees under app/, each
 * with its own layout and its own guard, so nothing in one can render inside
 * another:
 *
 *   CAREGIVER (a customer)  ->  /caregiver   the family app
 *   LAB (a partner lab)     ->  /lab         the partner terminal
 *   TECHNICIAN              ->  /field       the collection app
 *   OPS                     ->  /ops         the operations console
 */

import type { UserRole } from '../enums';

export const HOME_FOR_ROLE: Record<UserRole, string> = {
  CAREGIVER: '/caregiver',
  LAB: '/lab',
  TECHNICIAN: '/field',
  OPS: '/ops',
};

/** The landing page for a role; the public home for anything unknown. */
export function homeFor(role: string | null | undefined): string {
  return HOME_FOR_ROLE[role as UserRole] ?? '/';
}

/** Where a signed-out visitor to an area should sign in. */
export function signInFor(area: 'lab' | 'family'): string {
  return area === 'lab' ? '/lab/login' : '/login';
}
