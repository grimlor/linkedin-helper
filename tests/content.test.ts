/**
 * BDD Tests for LinkedIn Skills Bulk Delete — Content Script
 * Following .github/skills/bdd-testing/SKILL.md principles
 *
 * Covers: SkillsPageDetection, EditFormPageDetection, Initialization
 */

// Public API surface (from src/content.ts):
//   isSkillsPage(url: string): boolean
//   isEditFormPage(url: string): boolean
//   initialize(locationHref?, setIntervalFn?, clearIntervalFn?): void

import { isSkillsPage, isEditFormPage, initialize } from '../src/content';
import { resetUIState } from '../src/ui';

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
    initialize('https://www.linkedin.com/feed/', mockSetInterval);

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
    initialize(
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
    initialize(
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
    initialize(
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

  test('edit_form_page_without_queue_does_nothing', () => {
    /**
     * Given the user navigates to an edit form page manually (no deletion queue)
     * When initialize runs
     * Then it exits without error and no polling starts
     */
    // Given: edit form URL, no queue in sessionStorage
    const mockSetInterval = jest.fn();

    // When: initialize runs
    initialize(
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
    initialize(
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
    initialize(
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
});
