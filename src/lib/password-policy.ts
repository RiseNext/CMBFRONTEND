/**
 * Client-side mirror of `backend/src/lib/password.ts`.
 *
 * The server remains the authority — it re-runs these checks and returns 422
 * if they fail. This exists only so the user is told what is wrong while they
 * are typing rather than after a round trip.
 */

export const PASSWORD_MIN_LENGTH = 12;

export function passwordProblems(plain: string): string[] {
  const problems: string[] = [];
  if (plain.length < PASSWORD_MIN_LENGTH) {
    problems.push(`must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (!/[a-z]/.test(plain)) problems.push("must contain a lowercase letter");
  if (!/[A-Z]/.test(plain)) problems.push("must contain an uppercase letter");
  if (!/[0-9]/.test(plain)) problems.push("must contain a digit");
  return problems;
}
