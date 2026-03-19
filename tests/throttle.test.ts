/**
 * BDD Tests for LinkedIn Skills Bulk Delete — Throttle & Bulk Orchestration
 * Following .github/skills/bdd-testing/SKILL.md principles
 *
 * Covers: BulkDeletionOrchestration (backoff logic + orchestration)
 */

// Public API surface (from src/throttle.ts):
//   calculateBackoffDelay(currentDelay: number, options: ThrottleOptions): number
//   bulkDeleteSkills(skills: SkillCard[], deleteFn, options?, delayFn?): Promise<BulkDeleteResult>
//   defaultDelayFn(ms: number): Promise<void>
//   DEFAULT_OPTIONS: ThrottleOptions

import { calculateBackoffDelay, bulkDeleteSkills, defaultDelayFn, DEFAULT_OPTIONS } from '../src/throttle';
import { SkillCard, ThrottleOptions } from '../src/types';

/**
 * Helper to create a minimal SkillCard for orchestration testing.
 */
function makeSkillCard(name: string, id: string): SkillCard {
  const el = document.createElement('li');
  el.id = id;
  return { element: el, name, id, editUrl: `/in/user/details/skills/edit/forms/${id}/` };
}

describe('BackoffCalculation', () => {
  /**
   * REQUIREMENT: Exponential backoff must correctly calculate delays.
   *
   * WHO: The bulk deletion orchestrator
   * WHAT: (1) multiplies current delay by backoffMultiplier
   *       (2) caps delay at maxDelayMs
   * WHY: Without correct backoff, the extension either hammers LinkedIn
   *      or waits too long between retries.
   *
   * MOCK BOUNDARY:
   *   Mock:  nothing — pure computation
   *   Real:  calculateBackoffDelay function
   *   Never: Timing functions
   */

  test('delay_increases_by_multiplier', () => {
    /**
     * Given a current delay of 500ms and a multiplier of 2
     * When calculateBackoffDelay is called
     * Then the new delay is 1000ms
     */
    // Given: base delay and options
    const options: ThrottleOptions = { baseDelayMs: 500, maxDelayMs: 30000, backoffMultiplier: 2 };

    // When: backoff is calculated
    const newDelay = calculateBackoffDelay(500, options);

    // Then: delay doubles
    expect(newDelay).toBe(1000);
  });

  test('delay_does_not_exceed_max', () => {
    /**
     * Given a current delay of 20000ms with max of 30000ms and multiplier of 2
     * When calculateBackoffDelay is called
     * Then the new delay is capped at 30000ms
     */
    // Given: delay near max
    const options: ThrottleOptions = { baseDelayMs: 500, maxDelayMs: 30000, backoffMultiplier: 2 };

    // When: backoff is calculated
    const newDelay = calculateBackoffDelay(20000, options);

    // Then: delay is capped at max
    expect(newDelay).toBe(30000);
  });
});

describe('BulkDeletionOrchestration', () => {
  /**
   * REQUIREMENT: The extension must delete multiple skills in sequence with throttling.
   *
   * WHO: The user — they trigger this via "Delete Selected" after confirmation
   * WHAT: (1) all skills deleted successfully returns correct counts
   *       (2) partial failure records the failed skill in results
   *       (3) rate-limit detection increases delay via backoff
   *       (4) backoff sequence follows baseDelay * multiplier^n
   *       (5) delay does not exceed maxDelayMs
   *       (6) delay resets to baseDelayMs after successful deletion post-backoff
   * WHY: Rate-limiting can halt the process; backoff ensures reliable completion.
   *
   * MOCK BOUNDARY:
   *   Mock:  deleteFn (to control success/failure per skill), delayFn (to avoid real waits)
   *   Real:  Orchestration logic, backoff calculation, result aggregation
   *   Never: Actual DOM interaction (that's deleteSingleSkill's job)
   */

  test('all_skills_deleted_successfully', async () => {
    /**
     * Given 3 skills are selected and all deletions succeed
     * When bulkDeleteSkills is called
     * Then it returns { total: 3, succeeded: 3, failed: 0, rateLimited: false }
     */
    // Given: 3 skills and a delete function that always succeeds
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
      makeSkillCard('Python', 'skill-3'),
    ];
    const deleteFn = jest.fn().mockResolvedValue({ success: true });
    const delayFn = jest.fn().mockResolvedValue(undefined);

    // When: bulk deletion is performed
    const result = await bulkDeleteSkills(skills, deleteFn, {}, delayFn);

    // Then: all 3 succeed
    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.rateLimited).toBe(false);
  });

  test('second_skill_fails_and_is_recorded', async () => {
    /**
     * Given 3 skills are selected and the 2nd fails
     * When bulkDeleteSkills is called
     * Then it returns { total: 3, succeeded: 2, failed: 1 } with the failure recorded
     */
    // Given: 3 skills, 2nd one fails
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
      makeSkillCard('Python', 'skill-3'),
    ];
    const deleteFn = jest.fn()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'Modal did not appear' })
      .mockResolvedValueOnce({ success: true });
    const delayFn = jest.fn().mockResolvedValue(undefined);

    // When: bulk deletion is performed
    const result = await bulkDeleteSkills(skills, deleteFn, {}, delayFn);

    // Then: 2 succeed, 1 fails
    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    const failedResult = result.results.find(r => !r.success);
    expect(failedResult).toBeDefined();
    expect(failedResult!.skill.name).toBe('JavaScript');
  });

  test('rate_limiting_triggers_backoff', async () => {
    /**
     * Given a deletion triggers a rate-limit indicator
     * When bulkDeleteSkills processes the next skill
     * Then the delay before the next attempt is multiplied by backoffMultiplier
     */
    // Given: 3 skills, 1st triggers rate limit (simulated via error)
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
      makeSkillCard('Python', 'skill-3'),
    ];
    const deleteFn = jest.fn()
      .mockResolvedValueOnce({ success: false, error: 'rate limited' })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });
    const delayFn = jest.fn().mockResolvedValue(undefined);

    // When: bulk deletion is performed
    const result = await bulkDeleteSkills(skills, deleteFn, { baseDelayMs: 500, backoffMultiplier: 2 }, delayFn);

    // Then: rate limiting was detected and backoff applied
    expect(result.rateLimited).toBe(true);
    // The delay after the rate-limited request should be doubled
    const delayCallArgs = delayFn.mock.calls.map((call: any[]) => call[0]);
    expect(delayCallArgs).toContain(1000); // 500 * 2
  });

  test('backoff_follows_exponential_sequence', async () => {
    /**
     * Given baseDelayMs is 500 and backoffMultiplier is 2
     * When rate-limiting is detected twice consecutively
     * Then the delay sequence is 500 → 1000 → 2000
     */
    // Given: 4 skills, first two trigger rate limits
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
      makeSkillCard('Python', 'skill-3'),
      makeSkillCard('React', 'skill-4'),
    ];
    const deleteFn = jest.fn()
      .mockResolvedValueOnce({ success: false, error: 'rate limited' })
      .mockResolvedValueOnce({ success: false, error: 'rate limited' })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });
    const delayFn = jest.fn().mockResolvedValue(undefined);

    // When: bulk deletion is performed
    await bulkDeleteSkills(skills, deleteFn, { baseDelayMs: 500, backoffMultiplier: 2 }, delayFn);

    // Then: delay sequence follows exponential pattern
    const delayCallArgs = delayFn.mock.calls.map((call: any[]) => call[0]);
    // First delay: 500 (base), after 1st rate limit: 1000, after 2nd: 2000
    expect(delayCallArgs[0]).toBe(500);
    expect(delayCallArgs[1]).toBe(1000);
    expect(delayCallArgs[2]).toBe(2000);
  });

  test('delay_resets_after_success_following_backoff', async () => {
    /**
     * Given a deletion succeeds after backoff was active
     * When the next skill is processed
     * Then the delay resets to baseDelayMs
     */
    // Given: 3 skills, 1st triggers rate limit, 2nd succeeds
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
      makeSkillCard('Python', 'skill-3'),
    ];
    const deleteFn = jest.fn()
      .mockResolvedValueOnce({ success: false, error: 'rate limited' })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });
    const delayFn = jest.fn().mockResolvedValue(undefined);

    // When: bulk deletion is performed
    await bulkDeleteSkills(skills, deleteFn, { baseDelayMs: 500, backoffMultiplier: 2 }, delayFn);

    // Then: delay after successful deletion resets to base
    const delayCallArgs = delayFn.mock.calls.map((call: any[]) => call[0]);
    // After rate limit (delay was 1000), next success should reset to 500
    const lastDelay = delayCallArgs[delayCallArgs.length - 1];
    expect(lastDelay).toBe(500);
  });

  test('default_options_are_sensible', () => {
    /**
     * Given the DEFAULT_OPTIONS constant
     * When inspected
     * Then baseDelayMs is 500, maxDelayMs is 30000, backoffMultiplier is 2
     */
    // Given/When: inspect defaults
    // Then: sensible defaults
    expect(DEFAULT_OPTIONS.baseDelayMs).toBe(500);
    expect(DEFAULT_OPTIONS.maxDelayMs).toBe(30000);
    expect(DEFAULT_OPTIONS.backoffMultiplier).toBe(2);
  });

  test('default_delay_fn_returns_a_promise', async () => {
    /**
     * Given the defaultDelayFn function
     * When called with 0ms
     * Then it resolves without error
     */
    // Given/When: call with minimal delay
    const result = defaultDelayFn(0);

    // Then: it returns a promise that resolves
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  test('bulk_delete_uses_default_delay_when_none_provided', async () => {
    /**
     * Given bulkDeleteSkills is called without a custom delayFn
     * When deletion proceeds
     * Then it uses the default delay function internally
     */
    // Given: 1 skill with instant-resolving deleteFn, no custom delayFn
    jest.useFakeTimers();
    const skills = [makeSkillCard('TypeScript', 'skill-1')];
    const deleteFn = jest.fn().mockResolvedValue({ success: true });

    // When: bulk delete is called without delayFn
    const resultPromise = bulkDeleteSkills(skills, deleteFn, { baseDelayMs: 10 });

    // Advance timers to resolve the default delay
    jest.advanceTimersByTime(100);
    await Promise.resolve();
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    const result = await resultPromise;

    // Then: deletion completed successfully using the default delay
    expect(result.succeeded).toBe(1);
    jest.useRealTimers();
  });
});
