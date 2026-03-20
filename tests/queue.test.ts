/**
 * BDD Tests for LinkedIn Skills Bulk Delete — Deletion Queue State Management
 * Following .github/skills/bdd-testing/SKILL.md principles
 *
 * Covers: QueueStateManagement, StartDeletionQueue
 */

// Public API surface (from src/queue.ts):
//   getDeletionState(): DeletionState | null
//   setDeletionState(state: DeletionState): void
//   clearDeletionState(): void
//   startDeletionQueue(skills: SkillCard[], navigate?): void

import {
  getDeletionState,
  setDeletionState,
  clearDeletionState,
  startDeletionQueue,
  DeletionState,
} from '../src/queue';
import { SkillCard } from '../src/types';

describe('QueueStateManagement', () => {
  /**
   * REQUIREMENT: Deletion queue state must persist across page reloads via sessionStorage.
   *
   * WHO: The content script — it reads/writes queue state on each page load
   * WHAT: (1) getDeletionState returns null when no state exists
   *       (2) setDeletionState persists state that getDeletionState can retrieve
   *       (3) clearDeletionState removes the state so getDeletionState returns null
   *       (4) getDeletionState returns null for corrupted/unparseable data
   * WHY: LinkedIn does a full page reload after each deletion, destroying
   *      the JavaScript execution context. Without persistence, the bulk
   *      deletion loop dies after the first skill.
   *
   * MOCK BOUNDARY:
   *   Mock:  nothing — jsdom provides sessionStorage
   *   Real:  sessionStorage read/write via getDeletionState/setDeletionState/clearDeletionState
   *   Never: window.location navigation
   */

  beforeEach(() => {
    sessionStorage.clear();
  });

  test('returns_null_when_no_state_exists', () => {
    /**
     * Given sessionStorage has no deletion state
     * When getDeletionState is called
     * Then it returns null
     */
    // Given: empty sessionStorage

    // When: reading state
    const state = getDeletionState();

    // Then: null is returned
    expect(state).toBeNull();
  });

  test('persists_and_retrieves_state', () => {
    /**
     * Given a DeletionState is stored via setDeletionState
     * When getDeletionState is called
     * Then it returns the same state
     */
    // Given: a state is persisted
    const state: DeletionState = {
      queue: [{ id: '59', name: 'TypeScript', editUrl: '/in/user/details/skills/edit/forms/59/' }],
      completed: [{ name: 'JavaScript', success: true }],
      total: 2,
    };
    setDeletionState(state);

    // When: state is retrieved
    const retrieved = getDeletionState();

    // Then: it matches what was stored
    expect(retrieved).toEqual(state);
  });

  test('clear_removes_state', () => {
    /**
     * Given a DeletionState exists in sessionStorage
     * When clearDeletionState is called
     * Then getDeletionState returns null
     */
    // Given: state exists
    setDeletionState({
      queue: [{ id: '59', name: 'TypeScript', editUrl: '/edit/forms/59/' }],
      completed: [],
      total: 1,
    });

    // When: state is cleared
    clearDeletionState();

    // Then: no state remains
    expect(getDeletionState()).toBeNull();
  });

  test('returns_null_for_corrupted_data', () => {
    /**
     * Given sessionStorage contains invalid JSON for the deletion state key
     * When getDeletionState is called
     * Then it returns null without throwing
     */
    // Given: corrupted data in sessionStorage
    sessionStorage.setItem('linkedin-bulk-delete-state', '{invalid json!!!');

    // When: reading state
    const state = getDeletionState();

    // Then: null is returned (graceful handling)
    expect(state).toBeNull();
  });
});

describe('StartDeletionQueue', () => {
  /**
   * REQUIREMENT: Starting the deletion queue must persist the selected skills
   * and navigate to the first skill's edit form.
   *
   * WHO: The UI delete button handler — it calls this after user confirmation
   * WHAT: (1) saves the queue to sessionStorage with all selected skills
   *       (2) navigates to the first skill's edit URL
   *       (3) does nothing if skills array is empty
   * WHY: This initiates the cross-reload deletion flow; without it the
   *      content script has no queue to process after the page reloads.
   *
   * MOCK BOUNDARY:
   *   Mock:  navigate function (to avoid real window.location assignment)
   *   Real:  sessionStorage persistence via queue functions
   *   Never: Actual browser navigation
   */

  beforeEach(() => {
    sessionStorage.clear();
  });

  test('saves_queue_and_navigates_to_first_skill', () => {
    /**
     * Given 3 skills are selected for deletion
     * When startDeletionQueue is called
     * Then the queue is saved and navigation goes to the first skill's edit URL
     */
    // Given: 3 skills
    const skills: SkillCard[] = [
      { element: document.createElement('a'), name: 'TypeScript', id: '59', editUrl: '/in/user/details/skills/edit/forms/59/' },
      { element: document.createElement('a'), name: 'JavaScript', id: '60', editUrl: '/in/user/details/skills/edit/forms/60/' },
      { element: document.createElement('a'), name: 'Python', id: '61', editUrl: '/in/user/details/skills/edit/forms/61/' },
    ];
    const navigate = jest.fn();

    // When: queue is started
    startDeletionQueue(skills, navigate);

    // Then: queue is saved with all 3 skills
    const state = getDeletionState();
    expect(state).not.toBeNull();
    expect(state!.queue).toHaveLength(3);
    expect(state!.total).toBe(3);
    expect(state!.completed).toHaveLength(0);
    expect(state!.queue[0].name).toBe('TypeScript');

    // And: navigation goes to the first skill's edit URL
    expect(navigate).toHaveBeenCalledWith('/in/user/details/skills/edit/forms/59/');
  });

  test('does_nothing_for_empty_skills_array', () => {
    /**
     * Given no skills are selected
     * When startDeletionQueue is called
     * Then no state is saved and no navigation occurs
     */
    // Given: empty skills array
    const navigate = jest.fn();

    // When: queue is started with empty array
    startDeletionQueue([], navigate);

    // Then: no state saved
    expect(getDeletionState()).toBeNull();

    // And: no navigation
    expect(navigate).not.toHaveBeenCalled();
  });

  test('uses_default_navigate_to_set_window_location', () => {
    /**
     * Given skills are provided but no custom navigate function
     * When startDeletionQueue is called without the navigate parameter
     * Then it uses the default which sets window.location.href
     */
    // Given: one skill, mock window.location to capture the assignment
    const skills: SkillCard[] = [
      { element: document.createElement('a'), name: 'TypeScript', id: '59', editUrl: '/in/user/details/skills/edit/forms/59/' },
    ];
    const savedLocation = window.location;
    // @ts-expect-error — replace Location with simple object to prevent jsdom navigation
    delete window.location;
    (window as any).location = { href: '' };

    // When: queue is started without navigate param (uses default)
    startDeletionQueue(skills);

    // Then: window.location.href was set to the first skill's edit URL
    expect(window.location.href).toBe('/in/user/details/skills/edit/forms/59/');

    // Cleanup
    (window as any).location = savedLocation;
  });
});
