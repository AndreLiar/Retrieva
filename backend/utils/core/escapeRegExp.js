/**
 * Escape a user-supplied string so it can be used safely inside a MongoDB
 * `$regex` value. Neutralizes regex metacharacters to prevent regex injection
 * and ReDoS (catastrophic backtracking) from crafted input.
 *
 * @param {string} input
 * @returns {string} regex-safe literal
 */
export function escapeRegExp(input) {
  return String(input ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
