import { envProblems } from "@/lib/env-check";

/**
 * A-057: say so loudly when the real app starts with incomplete settings. (scripts/migrate.mjs already fails the
 * deploy for the same reasons, so this is a second line; it only logs, so a running studio is never taken down by it.)
 */
export function register() {
  const problems = envProblems(process.env);
  if (problems.length) console.error(`[config] incomplete settings: ${problems.join("; ")}`);
}
