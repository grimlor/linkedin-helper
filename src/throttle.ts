/**
 * Bulk deletion orchestration with exponential backoff.
 */

import { SkillCard, BulkDeleteResult, DeleteResult, ThrottleOptions } from './types';

const DEFAULT_OPTIONS: ThrottleOptions = {
  baseDelayMs: 500,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Calculates the next delay using exponential backoff, capped at maxDelayMs.
 */
export function calculateBackoffDelay(
  currentDelay: number,
  options: ThrottleOptions
): number {
  return Math.min(currentDelay * options.backoffMultiplier, options.maxDelayMs);
}

/**
 * Default delay function that waits for the specified milliseconds.
 */
export function defaultDelayFn(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detects whether an error indicates rate-limiting.
 */
function isRateLimited(error?: string): boolean {
  return !!error && error.toLowerCase().includes('rate');
}

/**
 * Orchestrates deletion of multiple skills with throttling and backoff.
 */
export async function bulkDeleteSkills(
  skills: SkillCard[],
  deleteFn: (skill: SkillCard) => Promise<{ success: boolean; error?: string }>,
  options?: Partial<ThrottleOptions>,
  delayFn?: (ms: number) => Promise<void>
): Promise<BulkDeleteResult> {
  const opts: ThrottleOptions = { ...DEFAULT_OPTIONS, ...options };
  const delay = delayFn ?? defaultDelayFn;

  const results: DeleteResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let rateLimited = false;
  let currentDelay = opts.baseDelayMs;

  for (const skill of skills) {
    await delay(currentDelay);

    const outcome = await deleteFn(skill);
    const result: DeleteResult = {
      skill,
      success: outcome.success,
      error: outcome.error,
    };
    results.push(result);

    if (outcome.success) {
      succeeded++;
      currentDelay = opts.baseDelayMs;
    } else {
      failed++;
      if (isRateLimited(outcome.error)) {
        rateLimited = true;
        currentDelay = calculateBackoffDelay(currentDelay, opts);
      }
    }
  }

  return {
    total: skills.length,
    succeeded,
    failed,
    results,
    rateLimited,
  };
}

export { DEFAULT_OPTIONS };
