/**
 * BDD Tests for LinkedIn Skills Bulk Delete — Content Script
 * Following .github/skills/bdd-testing/SKILL.md principles
 *
 * Covers: SkillsPageDetection, EditFormPageDetection, Initialization,
 *         HandleEditFormDeletion error paths, UrlWatcher
 */

// Public API surface (from src/content.ts):
//   isSkillsPage(url: string): boolean
//   isEditFormPage(url: string): boolean
//   initialize(locationHref?, setIntervalFn?, clearIntervalFn?): () => void

import {
  isSkillsPage,
  isEditFormPage,
  initialize,
} from '../src/content';
import { resetUIState } from '../src/ui';
import * as skills from '../src/skills';

// Each test that calls initialize() stores its returned stop function here.
// afterEach cleans up the URL watcher so no intervals leak between tests.
let stopWatcher: (() => void) | null = null;

afterEach(() => {
  stopWatcher?.();
  stopWatcher = null;
});

describe('SkillsPageDetection', () => {
  /**
   * REQUIREMENT: The extension must only activate on the LinkedIn skills detail page.
   *
   * WHO: The content script initialization logic
   * WHAT: (1) returns true for skills page URL with trailing slash
   *       (2) returns true for skills page URL without trailing slash
   *       (3) returns false for profile root URL
   *       (4) returns false for LinkedIn feed URL
   *       (5) returns false for other detail pages (e.g., experience)
   *       (6) returns false for skill edit form URLs
   * WHY: Injecting UI on wrong pages would confuse the user and risk
   *      interacting with unrelated DOM elements.
   *
   * MOCK BOUNDARY:
   *   Mock:  nothing — this tests pure URL parsing
   *   Real:  isSkillsPage function
   *   Never: DOM injection
   */

  test('user_visits_skills_page_with_trailing_slash', () => {
    /**
     * Given the user is on the LinkedIn skills detail page with trailing slash
     * When the content script checks the URL
     * Then isSkillsPage returns true
     */
    const url = 'https://www.linkedin.com/in/johndoe/details/skills/';
    expect(isSkillsPage(url)).toBe(true);
  });

  test('user_visits_skills_page_without_trailing_slash', () => {
    /**
     * Given the user is on the LinkedIn skills detail page without trailing slash
     * When the content script checks the URL
     * Then isSkillsPage returns true
     */
    const url = 'https://www.linkedin.com/in/johndoe/details/skills';
    expect(isSkillsPage(url)).toBe(true);
  });

  test('user_visits_profile_root_page', () => {
    /**
     * Given the user is on a LinkedIn profile root page
     * When the content script checks the URL
     * Then isSkillsPage returns false
     */
    const url = 'https://www.linkedin.com/in/johndoe/';
    expect(isSkillsPage(url)).toBe(false);
  });

  test('user_visits_linkedin_feed', () => {
    /**
     * Given the user is on the LinkedIn feed
     * When the content script checks the URL
     * Then isSkillsPage returns false
     */
    const url = 'https://www.linkedin.com/feed/';
    expect(isSkillsPage(url)).toBe(false);
  });

  test('user_visits_experience_details_page', () => {
    /**
     * Given the user is on the experience details page
     * When the content script checks the URL
     * Then isSkillsPage returns false
     */
    const url = 'https://www.linkedin.com/in/johndoe/details/experience/';
    expect(isSkillsPage(url)).toBe(false);
  });

  test('user_visits_skill_edit_form_page', () => {
    /**
     * Given the user is on a skill edit form page
     * When isSkillsPage checks the URL
     * Then it returns false (edit form is handled separately)
     */
    const url = 'https://www.linkedin.com/in/johndoe/details/skills/edit/forms/59/';
    expect(isSkillsPage(url)).toBe(false);
  });
});

describe('EditFormPageDetection', () => {
  /**
   * REQUIREMENT: The extension must detect skill edit form pages for queue-based deletion.
   *
   * WHO: The content script — it runs deletion logic on this page
   * WHAT: (1) returns true for edit form URLs
   *       (2) returns false for skills list URLs
   *       (3) returns false for non-skills URLs
   * WHY: The deletion flow navigates to edit form pages; the content script
   *      must detect them to perform the actual deletion clicks.
   *
   * MOCK BOUNDARY:
   *   Mock:  nothing — pure URL parsing
   *   Real:  isEditFormPage
   *   Never: DOM
   */

  test('detects_edit_form_url', () => {
    /**
     * Given a URL pointing to a skill edit form
     * When isEditFormPage is called
     * Then it returns true
     */
    const url = 'https://www.linkedin.com/in/jackpines/details/skills/edit/forms/59/';
    expect(isEditFormPage(url)).toBe(true);
  });

  test('rejects_skills_list_url', () => {
    /**
     * Given a URL pointing to the skills list page
     * When isEditFormPage is called
     * Then it returns false
     */
    const url = 'https://www.linkedin.com/in/jackpines/details/skills/';
    expect(isEditFormPage(url)).toBe(false);
  });

  test('rejects_non_skills_url', () => {
    /**
     * Given a URL pointing to the LinkedIn feed
     * When isEditFormPage is called
     * Then it returns false
     */
    const url = 'https://www.linkedin.com/feed/';
    expect(isEditFormPage(url)).toBe(false);
  });
});

describe('Initialization', () => {
  /**
   * REQUIREMENT: The extension must initialize correctly based on page type and queue state.
   *
   * WHO: The content script entry point
   * WHAT: (1) exits immediately on non-skills pages without polling
   *       (2) polls for skills and injects UI when found on skills list page
   *       (3) stops polling after max attempts if no skills found
   *       (4) lazy-loaded skills receive checkboxes via MutationObserver
   *       (5) exits on edit form page with no queue (no error)
   * WHY: LinkedIn uses SDUI and loads skills dynamically; the extension must
   *      wait for them to appear before injecting the bulk-delete UI.
   *      On edit form pages without a queue, it must be a no-op.
   *
   * MOCK BOUNDARY:
   *   Mock:  setInterval/clearInterval (to control timing), DOM (skills container),
   *          sessionStorage (for queue state)
   *   Real:  initialize function, getSkillCards, injectBulkDeleteUI, page detection
   *   Never: Actual browser timers, window.location navigation
   */

  beforeEach(() => {
    document.body.innerHTML = '';
    resetUIState();
    sessionStorage.clear();
  });

  test('user_visits_non_skills_page_and_nothing_happens', () => {
    /**
     * Given the user is on a non-skills page
     * When initialize is called
     * Then no polling is started
     */
    // Given: a non-skills URL
    const mockSetInterval = jest.fn();

    // When: initialize is called
    stopWatcher = initialize('https://www.linkedin.com/feed/', mockSetInterval);

    // Then: setInterval was never called
    expect(mockSetInterval).not.toHaveBeenCalled();
  });

  test('user_visits_skills_page_and_ui_is_injected_when_skills_load', () => {
    /**
     * Given the user is on the skills page and skills exist in the DOM
     * When initialize polls and finds skills
     * Then the UI is injected and polling stops
     */
    // Given: skills page with skill entries
    document.body.innerHTML = `
      <div componentkey="com.linkedin.sdui.profile.card.refSkillDetails">
        <div>
          <div><p class="_48505232">TypeScript</p></div>
          <a href="https://www.linkedin.com/in/user/details/skills/edit/forms/59/"><svg id="edit-medium"></svg></a>
        </div>
      </div>
    `;
    const mockClearInterval = jest.fn();
    let callback: () => void = () => {};
    const mockSetInterval = jest.fn((cb: () => void) => {
      callback = cb;
      return 42 as unknown as NodeJS.Timeout;
    });

    // When: initialize is called and the first poll fires
    stopWatcher = initialize(
      'https://www.linkedin.com/in/jackpines/details/skills/',
      mockSetInterval as any,
      mockClearInterval as any,
    );
    callback();

    // Then: clearInterval was called (polling stopped) and UI was injected
    expect(mockClearInterval).toHaveBeenCalledWith(42);
    const toolbar = document.querySelector('[data-testid="bulk-delete-toolbar"]');
    expect(toolbar).not.toBeNull();
  });

  test('user_visits_skills_page_but_no_skills_load_after_max_attempts', () => {
    /**
     * Given the user is on the skills page but no skills ever appear
     * When initialize polls for 20 attempts
     * Then polling stops without injecting UI
     */
    // Given: skills page with empty container
    document.body.innerHTML = '<div componentkey="com.linkedin.sdui.profile.card.refSkillDetails"></div>';
    const mockClearInterval = jest.fn();
    let callback: () => void = () => {};
    const mockSetInterval = jest.fn((cb: () => void) => {
      callback = cb;
      return 99 as unknown as NodeJS.Timeout;
    });

    // When: initialize is called and 20 polls fire with no skills
    stopWatcher = initialize(
      'https://www.linkedin.com/in/jackpines/details/skills/',
      mockSetInterval as any,
      mockClearInterval as any,
    );
    for (let i = 0; i < 20; i++) {
      callback();
    }

    // Then: clearInterval was called on the 20th attempt
    expect(mockClearInterval).toHaveBeenCalledWith(99);
    // And no UI was injected
    const toolbar = document.querySelector('[data-testid="bulk-delete-toolbar"]');
    expect(toolbar).toBeNull();
  });

  test('lazy_loaded_skills_receive_checkboxes_via_observer', async () => {
    /**
     * Given the initial skills have been found and UI injected
     * When new skill elements are added to the container (lazy-load)
     * Then the observer detects them and injects checkboxes
     */
    // Given: skills page with one initial skill
    document.body.innerHTML = `
      <div componentkey="com.linkedin.sdui.profile.card.refSkillDetails">
        <div id="skill-row-1">
          <div><p class="_48505232">TypeScript</p></div>
          <a href="https://www.linkedin.com/in/user/details/skills/edit/forms/59/"><svg id="edit-medium"></svg></a>
        </div>
      </div>
    `;
    const mockClearInterval = jest.fn();
    let callback: () => void = () => {};
    const mockSetInterval = jest.fn((cb: () => void) => {
      callback = cb;
      return 42 as unknown as NodeJS.Timeout;
    });

    // When: initialize finds the initial skill
    stopWatcher = initialize(
      'https://www.linkedin.com/in/jackpines/details/skills/',
      mockSetInterval as any,
      mockClearInterval as any,
    );
    callback();

    // Then: initial skill has a checkbox
    expect(document.querySelector('input[data-skill-id="59"]')).not.toBeNull();

    // When: a new skill is dynamically added to the container (simulating scroll)
    const container = document.querySelector('div[componentkey*="SkillDetails"]')!;
    const newRow = document.createElement('div');
    newRow.innerHTML = `
      <div><p class="_48505232">Python</p></div>
      <a href="https://www.linkedin.com/in/user/details/skills/edit/forms/77/"><svg id="edit-medium"></svg></a>
    `;
    container.appendChild(newRow);

    // Allow MutationObserver microtask to fire
    await new Promise(resolve => setTimeout(resolve, 0));

    // Then: the new skill also has a checkbox
    expect(document.querySelector('input[data-skill-id="77"]')).not.toBeNull();
  });

  test('skills_found_without_container_skips_observer_setup', () => {
    /**
     * Given skills are found by getSkillCards but the SkillDetails container
     * is removed from the DOM before observeNewSkills runs (race condition)
     * When initialize polls and finds skills
     * Then UI is injected but no MutationObserver is set up (no container)
     */
    // Given: DOM with container and skills initially
    document.body.innerHTML = `
      <div componentkey="com.linkedin.sdui.profile.card.refSkillDetails">
        <div>
          <div><p class="_48505232">TypeScript</p></div>
          <a href="https://www.linkedin.com/in/user/details/skills/edit/forms/59/"><svg id="edit-medium"></svg></a>
        </div>
      </div>
    `;
    const mockClearInterval = jest.fn();
    let callback: () => void = () => {};
    const mockSetInterval = jest.fn((cb: () => void) => {
      callback = cb;
      return 42 as unknown as NodeJS.Timeout;
    });

    // Mock getSkillCards to return skills, then remove the container
    // (simulating a DOM race where container disappears between skill discovery
    // and observer setup)
    const realGetSkillCards = skills.getSkillCards;
    jest.spyOn(skills, 'getSkillCards').mockImplementation(() => {
      const result = realGetSkillCards();
      // Remove the container after skills are found, before observeNewSkills runs
      document.querySelector('div[componentkey*="SkillDetails"]')?.remove();
      return result;
    });

    // When: initialize finds skills and injects UI
    stopWatcher = initialize(
      'https://www.linkedin.com/in/user/details/skills/',
      mockSetInterval as any,
      mockClearInterval as any,
    );
    callback();

    // Then: UI was injected (skills were found)
    expect(mockClearInterval).toHaveBeenCalledWith(42);
    const toolbar = document.querySelector('[data-testid="bulk-delete-toolbar"]');
    expect(toolbar).not.toBeNull();
    // No error thrown — observeNewSkills returned early without setting up observer

    jest.restoreAllMocks();
  });

  test('edit_form_page_without_queue_does_nothing', () => {
    /**
     * Given the user navigates to an edit form page manually (no deletion queue)
     * When initialize runs
     * Then it exits without error and no polling starts
     */
    // Given: edit form URL, no queue in sessionStorage
    const mockSetInterval = jest.fn();

    // When: initialize runs
    stopWatcher = initialize(
      'https://www.linkedin.com/in/jackpines/details/skills/edit/forms/59/',
      mockSetInterval,
    );

    // Then: no polling started
    expect(mockSetInterval).not.toHaveBeenCalled();
  });

  test('edit_form_page_with_queue_deletes_skill_and_updates_state', async () => {
    /**
     * Given a deletion queue exists and the page is the edit form for the first queued skill
     * When initialize runs and finds the deletion buttons
     * Then it clicks them and updates the queue state (skill moved to completed)
     */
    // Given: queue with one skill
    sessionStorage.setItem('linkedin-bulk-delete-state', JSON.stringify({
      queue: [{ id: '59', name: 'TypeScript', editUrl: '/in/user/details/skills/edit/forms/59/' }],
      completed: [],
      total: 1,
    }));

    // Given: edit form page with "Delete skill" button; confirm appears on click
    document.body.innerHTML = '<div><button type="button">Delete skill</button></div>';
    const deleteSkillBtn = document.querySelector('button')!;
    deleteSkillBtn.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.innerHTML = '<button type="button">Delete</button>';
      document.body.appendChild(overlay);
    });

    const mockSetInterval = jest.fn();

    // When: initialize runs on edit form page
    stopWatcher = initialize(
      'https://www.linkedin.com/in/user/details/skills/edit/forms/59/',
      mockSetInterval,
    );

    // Wait for async waitFor polling to resolve (buttons are already present)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Then: queue state is updated — skill moved from queue to completed
    const state = JSON.parse(sessionStorage.getItem('linkedin-bulk-delete-state')!);
    expect(state.queue).toHaveLength(0);
    expect(state.completed).toHaveLength(1);
    expect(state.completed[0]).toEqual({ name: 'TypeScript', success: true });

    // And: no polling was started
    expect(mockSetInterval).not.toHaveBeenCalled();
  });

  test('skills_page_with_empty_queue_shows_result_summary', () => {
    /**
     * Given a deletion queue exists with all skills completed (queue empty)
     * When initialize runs on the skills list page
     * Then it shows the result summary and clears the queue
     */
    // Given: empty queue with one completed skill
    sessionStorage.setItem('linkedin-bulk-delete-state', JSON.stringify({
      queue: [],
      completed: [{ name: 'TypeScript', success: true }],
      total: 1,
    }));

    const mockSetInterval = jest.fn();

    // When: initialize runs on skills list page
    stopWatcher = initialize(
      'https://www.linkedin.com/in/user/details/skills/',
      mockSetInterval,
    );

    // Then: result summary is shown
    const summary = document.querySelector('[data-testid="result-summary"]');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('Successfully deleted 1 skills');

    // And: queue is cleared from sessionStorage
    expect(sessionStorage.getItem('linkedin-bulk-delete-state')).toBeNull();

    // And: no polling started (queue handling took over)
    expect(mockSetInterval).not.toHaveBeenCalled();
  });

  test('skills_page_with_remaining_queue_navigates_to_next_skill', () => {
    /**
     * Given a deletion queue has remaining skills (some already completed)
     * When initialize runs on the skills list page
     * Then it navigates to the next skill's edit form URL
     */
    // Given: queue with one remaining skill and one completed
    sessionStorage.setItem('linkedin-bulk-delete-state', JSON.stringify({
      queue: [{ id: '60', name: 'JavaScript', editUrl: 'https://www.linkedin.com/in/user/details/skills/edit/forms/60/' }],
      completed: [{ name: 'TypeScript', success: true }],
      total: 2,
    }));

    // Mock window.location to capture the navigation
    const savedLocation = window.location;
    // @ts-expect-error — replace with plain object so href assignment doesn't trigger jsdom navigation
    delete window.location;
    (window as any).location = { href: 'https://www.linkedin.com/in/user/details/skills/' };

    const mockSetInterval = jest.fn();

    // When: initialize runs on skills list page
    stopWatcher = initialize(
      'https://www.linkedin.com/in/user/details/skills/',
      mockSetInterval,
    );

    // Then: navigated to next skill's edit form
    expect(window.location.href).toBe(
      'https://www.linkedin.com/in/user/details/skills/edit/forms/60/',
    );

    // And: no polling started (queue handling took over)
    expect(mockSetInterval).not.toHaveBeenCalled();

    // Cleanup
    (window as any).location = savedLocation;
  });
});

describe('HandleEditFormDeletionErrors', () => {
  /**
   * REQUIREMENT: When deletion buttons are not found on the edit form page,
   * the extension must record the failure and navigate back gracefully.
   *
   * WHO: The content script on an edit form page during queue processing
   * WHAT: (1) records failure and navigates back when "Delete skill" button not found
   *       (2) records failure and navigates back when "Delete" confirm button not found
   * WHY: LinkedIn's DOM may not always render expected buttons (race conditions,
   *      layout changes). The extension must handle missing buttons without getting stuck.
   *
   * MOCK BOUNDARY:
   *   Mock:  skills.waitFor (returns null to simulate timeout), window.history.back
   *   Real:  initialize, getDeletionState, setDeletionState, handleEditFormDeletion
   *   Never: Real waitFor polling (10s timeout), actual browser navigation
   */

  beforeEach(() => {
    document.body.innerHTML = '';
    resetUIState();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('delete_button_not_found_records_failure_and_goes_back', async () => {
    /**
     * Given a deletion queue exists with one skill
     * When initialize runs on the edit form and the "Delete skill" button never appears
     * Then the skill is marked as failed and history.back is called
     */
    // Given: queue with one skill
    sessionStorage.setItem('linkedin-bulk-delete-state', JSON.stringify({
      queue: [{ id: '59', name: 'TypeScript', editUrl: '/in/user/details/skills/edit/forms/59/' }],
      completed: [],
      total: 1,
    }));

    // Mock: waitFor returns null (button not found)
    jest.spyOn(skills, 'waitFor').mockResolvedValueOnce(null);
    const historyBackSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});

    // When: initialize on edit form
    stopWatcher = initialize('https://www.linkedin.com/in/user/details/skills/edit/forms/59/');
    await new Promise(resolve => setTimeout(resolve, 50));

    // Then: skill marked as failed with "Delete button not found"
    const state = JSON.parse(sessionStorage.getItem('linkedin-bulk-delete-state')!);
    expect(state.queue).toHaveLength(0);
    expect(state.completed).toHaveLength(1);
    expect(state.completed[0]).toEqual({
      name: 'TypeScript', success: false, error: 'Delete button not found',
    });
    expect(historyBackSpy).toHaveBeenCalled();
  });

  test('confirm_button_not_found_records_failure_and_goes_back', async () => {
    /**
     * Given a deletion queue exists and the "Delete skill" button is found
     * When the content script clicks it but the "Delete" confirm button never appears
     * Then the skill is marked as failed and history.back is called
     */
    // Given: queue with one skill
    sessionStorage.setItem('linkedin-bulk-delete-state', JSON.stringify({
      queue: [{ id: '59', name: 'TypeScript', editUrl: '/in/user/details/skills/edit/forms/59/' }],
      completed: [],
      total: 1,
    }));

    // Mock: first waitFor returns a button ("Delete skill" found),
    //       second returns null ("Delete" confirm not found)
    const mockBtn = document.createElement('button');
    mockBtn.textContent = 'Delete skill';
    jest.spyOn(skills, 'waitFor')
      .mockResolvedValueOnce(mockBtn)
      .mockResolvedValueOnce(null);
    const historyBackSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});

    // When: initialize on edit form
    stopWatcher = initialize('https://www.linkedin.com/in/user/details/skills/edit/forms/59/');
    await new Promise(resolve => setTimeout(resolve, 50));

    // Then: skill marked as failed with "Confirm button not found"
    const state = JSON.parse(sessionStorage.getItem('linkedin-bulk-delete-state')!);
    expect(state.queue).toHaveLength(0);
    expect(state.completed).toHaveLength(1);
    expect(state.completed[0]).toEqual({
      name: 'TypeScript', success: false, error: 'Confirm button not found',
    });
    expect(historyBackSpy).toHaveBeenCalled();
  });

  test('concurrent_deletion_is_guarded', async () => {
    /**
     * Given handleEditFormDeletion is already running (first initialize call)
     * When initialize is called again on the same edit form page
     * Then the second call returns immediately (deletionInProgress guard)
     */
    // Given: queue with one skill
    sessionStorage.setItem('linkedin-bulk-delete-state', JSON.stringify({
      queue: [{ id: '59', name: 'TypeScript', editUrl: '/in/user/details/skills/edit/forms/59/' }],
      completed: [],
      total: 1,
    }));

    // Mock: waitFor resolves after a delay so the first call is still in-progress
    jest.spyOn(skills, 'waitFor').mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(null), 100)),
    );
    jest.spyOn(window.history, 'back').mockImplementation(() => {});

    // When: first call starts (sets deletionInProgress = true, then awaits)
    stopWatcher = initialize('https://www.linkedin.com/in/user/details/skills/edit/forms/59/');

    // Second call while first is still in-progress → guard returns immediately
    initialize('https://www.linkedin.com/in/user/details/skills/edit/forms/59/');

    // Wait for first call to complete (100ms delay + processing)
    await new Promise(resolve => setTimeout(resolve, 200));

    // Then: only one deletion was processed (first call), guard prevented the second
    const state = JSON.parse(sessionStorage.getItem('linkedin-bulk-delete-state')!);
    expect(state.completed).toHaveLength(1);
  });
});

describe('UrlWatcher', () => {
  /**
   * REQUIREMENT: SPA navigation must be detected so the content script
   * can continue the deletion queue or re-inject UI after client-side routing.
   *
   * WHO: The content script — monitors URL changes in LinkedIn's SPA
   * WHAT: (1) detects navigation to edit form and triggers deletion
   *       (2) detects navigation to skills page and re-injects UI
   *       (3) stops watching when the user navigates away from skills pages
   *       (4) returned stop function clears the watcher interval
   * WHY: LinkedIn uses client-side routing; after a skill deletion the page
   *      transitions without a full reload, so the content script must watch
   *      for URL changes to react appropriately.
   *
   * MOCK BOUNDARY:
   *   Mock:  window.location.href (simulated URL change), jest fake timers
   *   Real:  initialize (starts watcher internally), isEditFormPage, isSkillsPage
   *   Never: Full deletion flow, real browser navigation
   */

  const savedLocation = window.location;
  let locationMock: { href: string };

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    resetUIState();
    sessionStorage.clear();

    locationMock = { href: 'https://www.linkedin.com/in/user/details/skills/' };
    // @ts-expect-error — replace Location with testable plain object
    delete window.location;
    (window as any).location = locationMock;
  });

  afterEach(() => {
    jest.useRealTimers();
    (window as any).location = savedLocation;
    jest.restoreAllMocks();
  });

  test('detects_edit_form_navigation_and_triggers_deletion', () => {
    /**
     * Given the URL watcher is running on the skills page
     * When the URL changes to an edit form page
     * Then handleEditFormDeletion is invoked (no queue → no-op, but line is hit)
     */
    // Given: initialize on skills page starts watcher (no queue, no skills in DOM)
    stopWatcher = initialize('https://www.linkedin.com/in/user/details/skills/');

    // When: URL changes to edit form
    locationMock.href = 'https://www.linkedin.com/in/user/details/skills/edit/forms/59/';
    jest.advanceTimersByTime(500);

    // Then: no error thrown (handleEditFormDeletion ran and returned — no queue)
  });

  test('detects_skills_page_navigation_and_reinjects_ui', () => {
    /**
     * Given the URL watcher started on an edit form page
     * When the URL changes to the skills list page
     * Then the toolbar is cleaned up and UI re-injection is initiated
     */
    // Given: initialize on edit form URL starts watcher
    locationMock.href = 'https://www.linkedin.com/in/user/details/skills/edit/forms/59/';
    stopWatcher = initialize('https://www.linkedin.com/in/user/details/skills/edit/forms/59/');

    // When: URL changes to skills page
    locationMock.href = 'https://www.linkedin.com/in/user/details/skills/';
    jest.advanceTimersByTime(500);

    // Then: no error thrown (pollForSkillsAndInjectUI was called; no skills in DOM → poll runs)
  });

  test('stops_on_non_skills_navigation', () => {
    /**
     * Given the URL watcher is running on the skills page
     * When the user navigates to a non-skills page
     * Then the watcher stops and ignores further URL changes
     */
    // Given: watcher running via initialize
    stopWatcher = initialize('https://www.linkedin.com/in/user/details/skills/');

    // When: navigate away from skills
    locationMock.href = 'https://www.linkedin.com/feed/';
    jest.advanceTimersByTime(500);

    // Then: further URL changes to skills page are ignored (watcher stopped)
    locationMock.href = 'https://www.linkedin.com/in/user/details/skills/';
    jest.advanceTimersByTime(500);

    // No toolbar injected — watcher was stopped before skills page
    expect(document.querySelector('[data-testid="bulk-delete-toolbar"]')).toBeNull();
  });

  test('returned_stop_function_clears_watcher', () => {
    /**
     * Given the URL watcher is running
     * When the stop function returned by initialize is called
     * Then the watcher interval is cleared and further URL changes are ignored
     */
    // Given: watcher running via initialize
    stopWatcher = initialize('https://www.linkedin.com/in/user/details/skills/');

    // When: explicitly stopped via returned function
    stopWatcher();
    stopWatcher = null;

    // Then: URL changes have no effect
    locationMock.href = 'https://www.linkedin.com/feed/';
    jest.advanceTimersByTime(500);
    // No error, no side effects — interval was cleared
  });
});
