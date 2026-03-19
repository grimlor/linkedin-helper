/**
 * BDD Tests for LinkedIn Skills Bulk Delete — UI Components
 * Following .github/skills/bdd-testing/SKILL.md principles
 *
 * Covers: UIInjection, LazyLoadSkills, ConfirmationDialog, ResultReporting
 */

// Public API surface (from src/ui.ts):
//   injectBulkDeleteUI(skills: SkillCard[]): void
//   getSelectedSkills(): SkillCard[]
//   showConfirmationDialog(skills: SkillCard[]): Promise<boolean>
//   showResultSummary(result: BulkDeleteResult): void

import {
  injectBulkDeleteUI,
  getSelectedSkills,
  showConfirmationDialog,
  showResultSummary,
  addNewSkills,
  resetUIState,
} from '../src/ui';
import { SkillCard, BulkDeleteResult } from '../src/types';
import { startDeletionQueue } from '../src/queue';

// Mock startDeletionQueue to avoid triggering navigation (tested separately)
jest.mock('../src/queue', () => ({
  startDeletionQueue: jest.fn(),
}));

/**
 * Helper to create a mock SkillCard for testing.
 */
function makeSkillCard(name: string, id: string): SkillCard {
  const el = document.createElement('li');
  el.className = 'pvs-list__paged-list-item';
  el.id = id;
  el.innerHTML = `<div class="pvs-entity"><span aria-hidden="true">${name}</span></div>`;
  return { element: el, name, id, editUrl: `/in/user/details/skills/edit/forms/${id}/` };
}

/**
 * Helper to create a SkillCard whose element is an <a> tag (matching real DOM).
 */
function makeSkillCardWithLink(name: string, id: string): SkillCard {
  const el = document.createElement('a');
  el.href = `/in/user/details/skills/edit/forms/${id}/`;
  el.innerHTML = `<span>${name}</span>`;
  return { element: el as unknown as HTMLElement, name, id, editUrl: el.href };
}

describe('UIInjection', () => {
  /**
   * REQUIREMENT: The extension must inject selection checkboxes and a bulk-delete toolbar.
   *
   * WHO: The user — they see and interact with the injected UI
   * WHAT: (1) each skill card gets a checkbox when UI is injected
   *       (2) a toolbar with "Delete Selected (0)" appears
   *       (3) checking 3 checkboxes updates button to "Delete Selected (3)"
   *       (4) "Select All" checks all checkboxes
   *       (5) "Deselect All" unchecks all checkboxes
   *       (6) checkbox is placed outside the edit link (not inside <a>)
   *       (7) delete button does nothing when no skills are selected
   *       (8) delete button starts deletion queue after confirmation
   * WHY: This is the core UX — without it, the user would still have
   *      to delete skills one at a time.
   *
   * MOCK BOUNDARY:
   *   Mock:  DOM structure (provide skill card elements)
   *   Real:  DOM manipulation, event listeners via injectBulkDeleteUI
   *   Never: The actual deletion flow
   */

  beforeEach(() => {
    document.body.innerHTML = '<div id="skills-container"></div>';
    resetUIState();
  });

  test('user_sees_checkboxes_on_each_skill_card', () => {
    /**
     * Given 5 skill cards exist on the page
     * When the UI is injected
     * Then each card has a checkbox element
     */
    // Given: 5 skill cards
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
      makeSkillCard('Python', 'skill-3'),
      makeSkillCard('React', 'skill-4'),
      makeSkillCard('Node.js', 'skill-5'),
    ];
    const container = document.getElementById('skills-container')!;
    skills.forEach(s => container.appendChild(s.element));

    // When: UI is injected
    injectBulkDeleteUI(skills);

    // Then: each skill card has a corresponding checkbox (as a sibling)
    skills.forEach(skill => {
      const checkbox = document.querySelector(`input[data-skill-id="${skill.id}"]`);
      expect(checkbox).not.toBeNull();
    });
  });

  test('user_sees_toolbar_with_zero_count', () => {
    /**
     * Given 5 skill cards exist on the page
     * When the UI is injected
     * Then a toolbar with "Delete Selected (0)" is visible
     */
    // Given: 5 skill cards
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
      makeSkillCard('Python', 'skill-3'),
      makeSkillCard('React', 'skill-4'),
      makeSkillCard('Node.js', 'skill-5'),
    ];
    const container = document.getElementById('skills-container')!;
    skills.forEach(s => container.appendChild(s.element));

    // When: UI is injected
    injectBulkDeleteUI(skills);

    // Then: toolbar shows count of 0
    const button = document.querySelector('[data-testid="delete-selected-btn"]');
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain('Delete Selected (0)');
  });

  test('user_checks_three_skills_and_count_updates', () => {
    /**
     * Given the UI has been injected with 5 skills
     * When the user checks 3 skill checkboxes
     * Then the button reads "Delete Selected (3)"
     */
    // Given: 5 skill cards with injected UI
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
      makeSkillCard('Python', 'skill-3'),
      makeSkillCard('React', 'skill-4'),
      makeSkillCard('Node.js', 'skill-5'),
    ];
    const container = document.getElementById('skills-container')!;
    skills.forEach(s => container.appendChild(s.element));
    injectBulkDeleteUI(skills);

    // When: user checks 3 checkboxes
    for (let i = 0; i < 3; i++) {
      const checkbox = document.querySelector(`input[data-skill-id="${skills[i].id}"]`) as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Then: button shows count of 3
    const button = document.querySelector('[data-testid="delete-selected-btn"]');
    expect(button!.textContent).toContain('Delete Selected (3)');
  });

  test('user_clicks_select_all', () => {
    /**
     * Given 5 skills exist
     * When the user clicks "Select All"
     * Then all 5 checkboxes are checked and button reads "Delete Selected (5)"
     */
    // Given: 5 skill cards with injected UI
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
      makeSkillCard('Python', 'skill-3'),
      makeSkillCard('React', 'skill-4'),
      makeSkillCard('Node.js', 'skill-5'),
    ];
    const container = document.getElementById('skills-container')!;
    skills.forEach(s => container.appendChild(s.element));
    injectBulkDeleteUI(skills);

    // When: user clicks Select All
    const selectAllBtn = document.querySelector('[data-testid="select-all-btn"]') as HTMLElement;
    selectAllBtn.click();

    // Then: all checkboxes are checked
    const selected = getSelectedSkills();
    expect(selected).toHaveLength(5);
    const button = document.querySelector('[data-testid="delete-selected-btn"]');
    expect(button!.textContent).toContain('Delete Selected (5)');
  });

  test('user_clicks_deselect_all', () => {
    /**
     * Given all 5 skills are selected
     * When the user clicks "Deselect All"
     * Then all checkboxes are unchecked and button reads "Delete Selected (0)"
     */
    // Given: 5 skill cards all selected
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
      makeSkillCard('Python', 'skill-3'),
      makeSkillCard('React', 'skill-4'),
      makeSkillCard('Node.js', 'skill-5'),
    ];
    const container = document.getElementById('skills-container')!;
    skills.forEach(s => container.appendChild(s.element));
    injectBulkDeleteUI(skills);

    // Select all first
    const selectAllBtn = document.querySelector('[data-testid="select-all-btn"]') as HTMLElement;
    selectAllBtn.click();

    // When: user clicks Deselect All
    const deselectAllBtn = document.querySelector('[data-testid="deselect-all-btn"]') as HTMLElement;
    deselectAllBtn.click();

    // Then: all checkboxes are unchecked
    const selected = getSelectedSkills();
    expect(selected).toHaveLength(0);
    const button = document.querySelector('[data-testid="delete-selected-btn"]');
    expect(button!.textContent).toContain('Delete Selected (0)');
  });

  test('checkbox_is_placed_outside_the_edit_link', () => {
    /**
     * Given skill cards are <a> (edit link) elements
     * When the UI is injected
     * Then the checkbox is a sibling before the <a>, not a child of it
     */
    // Given: skill card whose element is an <a> tag (real DOM structure)
    const skill = makeSkillCardWithLink('TypeScript', 'skill-1');
    const container = document.getElementById('skills-container')!;
    container.appendChild(skill.element);
    injectBulkDeleteUI([skill]);

    // Then: checkbox is NOT inside the <a> element
    const insideLink = skill.element.querySelector('input[type="checkbox"]');
    expect(insideLink).toBeNull();

    // Then: checkbox is a preceding sibling of the <a> element
    const checkbox = document.querySelector(`input[data-skill-id="${skill.id}"]`);
    expect(checkbox).not.toBeNull();
    expect(checkbox!.nextElementSibling).toBe(skill.element);
  });

  test('delete_button_does_nothing_when_no_skills_selected', async () => {
    /**
     * Given skills exist but none are checked
     * When the user clicks "Delete Selected"
     * Then no confirmation dialog appears
     */
    // Given: skills injected, none selected
    const skills = [makeSkillCard('TypeScript', 'skill-1')];
    const container = document.getElementById('skills-container')!;
    skills.forEach(s => container.appendChild(s.element));
    injectBulkDeleteUI(skills);

    // When: user clicks Delete Selected
    const deleteBtn = document.querySelector('[data-testid="delete-selected-btn"]') as HTMLElement;
    deleteBtn.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Then: no dialog appeared
    const dialog = document.querySelector('[data-testid="confirmation-dialog"]');
    expect(dialog).toBeNull();
  });

  test('delete_button_starts_deletion_queue_after_confirmation', async () => {
    /**
     * Given 1 skill is selected
     * When the user clicks "Delete Selected" and confirms
     * Then startDeletionQueue is called with the selected skills
     */
    // Given: 1 skill selected
    const skills = [makeSkillCard('TypeScript', 'skill-1')];
    const container = document.getElementById('skills-container')!;
    skills.forEach(s => container.appendChild(s.element));
    injectBulkDeleteUI(skills);
    const cb = document.querySelector('input[data-skill-id="skill-1"]') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));

    // When: user clicks Delete Selected
    const deleteBtn = document.querySelector('[data-testid="delete-selected-btn"]') as HTMLElement;
    deleteBtn.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Then: confirmation dialog appears
    const dialog = document.querySelector('[data-testid="confirmation-dialog"]');
    expect(dialog).not.toBeNull();

    // When: user clicks Confirm
    const confirmBtn = document.querySelector('[data-testid="confirm-btn"]') as HTMLElement;
    confirmBtn.click();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Then: startDeletionQueue was called with the selected skills
    expect(startDeletionQueue).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'TypeScript', id: 'skill-1' })]),
    );
  });
});

describe('LazyLoadSkills', () => {
  /**
   * REQUIREMENT: Skills loaded dynamically (via scroll) must also get checkboxes.
   *
   * WHO: The user — they scroll and expect newly loaded skills to be selectable
   * WHAT: (1) new skills get checkboxes and are included in selection
   *       (2) duplicate skills are not double-registered
   *       (3) detached skill elements do not cause errors
   * WHY: LinkedIn lazy-loads skill cards on scroll; without this, only the
   *      initial batch would be selectable.
   *
   * MOCK BOUNDARY:
   *   Mock:  DOM structure
   *   Real:  injectBulkDeleteUI, addNewSkills, getSelectedSkills
   *   Never: MutationObserver, deletion flow
   */

  beforeEach(() => {
    document.body.innerHTML = '<div id="skills-container"></div>';
    resetUIState();
  });

  test('new_skills_receive_checkboxes_and_are_selectable', () => {
    /**
     * Given initial skills are injected
     * When new skills are added via addNewSkills
     * Then they have checkboxes and appear in selection
     */
    // Given: initial skills injected
    const initial = [makeSkillCard('TypeScript', 'skill-1')];
    const container = document.getElementById('skills-container')!;
    initial.forEach(s => container.appendChild(s.element));
    injectBulkDeleteUI(initial);

    // When: new skills are added
    const newSkill = makeSkillCard('Python', 'skill-2');
    container.appendChild(newSkill.element);
    addNewSkills([newSkill]);

    // Then: new skill has a checkbox and is selectable
    const cb = document.querySelector('input[data-skill-id="skill-2"]') as HTMLInputElement;
    expect(cb).not.toBeNull();
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(getSelectedSkills()).toHaveLength(1);
    expect(getSelectedSkills()[0].name).toBe('Python');
  });

  test('duplicate_skills_are_not_double_registered', () => {
    /**
     * Given a skill has already been injected
     * When addNewSkills is called with the same skill
     * Then only one checkbox exists for that skill
     */
    // Given: skill-1 already injected
    const skill = makeSkillCard('TypeScript', 'skill-1');
    const container = document.getElementById('skills-container')!;
    container.appendChild(skill.element);
    injectBulkDeleteUI([skill]);

    // When: addNewSkills is called with the same skill id
    const duplicate = makeSkillCard('TypeScript', 'skill-1');
    container.appendChild(duplicate.element);
    addNewSkills([duplicate]);

    // Then: only one checkbox exists
    const checkboxes = document.querySelectorAll('input[data-skill-id="skill-1"]');
    expect(checkboxes).toHaveLength(1);
  });

  test('detached_skill_element_does_not_error', () => {
    /**
     * Given a skill element has no parent in the DOM
     * When addNewSkills is called with it
     * Then no checkbox is inserted but no error is thrown
     */
    // Given: a skill card not attached to the DOM
    const skill = makeSkillCard('Detached', 'skill-detached');
    // Don't append to the container — element.parentElement is null
    injectBulkDeleteUI([]);
    addNewSkills([skill]);

    // Then: no checkbox was inserted (no parent to insertBefore into)
    const cb = document.querySelector('input[data-skill-id="skill-detached"]');
    expect(cb).toBeNull();
  });
});

describe('ConfirmationDialog', () => {
  /**
   * REQUIREMENT: Before bulk deletion, the user must see and confirm what will be deleted.
   *
   * WHO: The user — they must explicitly approve the destructive action
   * WHAT: (1) dialog lists all selected skill names
   *       (2) clicking Confirm resolves with true
   *       (3) clicking Cancel resolves with false
   *       (4) pressing Escape resolves with false
   *       (5) double-clicking Confirm resolves only once (guard against re-entry)
   * WHY: Bulk deletion is irreversible on LinkedIn. A single confirmation
   *      replaces the many per-skill confirmations.
   *
   * MOCK BOUNDARY:
   *   Mock:  DOM (for rendering the dialog)
   *   Real:  Dialog rendering, button events, promise resolution
   *   Never: The deletion flow itself
   */

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('user_sees_all_selected_skill_names_in_dialog', () => {
    /**
     * Given 3 skills are selected ("TypeScript", "JavaScript", "Python")
     * When the confirmation dialog opens
     * Then all 3 skill names are listed in the dialog
     */
    // Given: 3 selected skills
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
      makeSkillCard('Python', 'skill-3'),
    ];

    // When: confirmation dialog is shown
    showConfirmationDialog(skills);

    // Then: all skill names appear in the dialog
    const dialogText = document.querySelector('[data-testid="confirmation-dialog"]')?.textContent ?? '';
    expect(dialogText).toContain('TypeScript');
    expect(dialogText).toContain('JavaScript');
    expect(dialogText).toContain('Python');
  });

  test('user_confirms_deletion', async () => {
    /**
     * Given the confirmation dialog is open
     * When the user clicks "Confirm"
     * Then the promise resolves with true
     */
    // Given: 2 selected skills and dialog shown
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
    ];
    const dialogPromise = showConfirmationDialog(skills);

    // When: user clicks Confirm
    const confirmBtn = document.querySelector('[data-testid="confirm-btn"]') as HTMLElement;
    confirmBtn.click();

    // Then: promise resolves with true
    const result = await dialogPromise;
    expect(result).toBe(true);
  });

  test('user_cancels_deletion', async () => {
    /**
     * Given the confirmation dialog is open
     * When the user clicks "Cancel"
     * Then the promise resolves with false
     */
    // Given: 2 selected skills and dialog shown
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
    ];
    const dialogPromise = showConfirmationDialog(skills);

    // When: user clicks Cancel
    const cancelBtn = document.querySelector('[data-testid="cancel-btn"]') as HTMLElement;
    cancelBtn.click();

    // Then: promise resolves with false
    const result = await dialogPromise;
    expect(result).toBe(false);
  });

  test('user_presses_escape_to_close_dialog', async () => {
    /**
     * Given the confirmation dialog is open
     * When the user presses Escape
     * Then the dialog closes and the promise resolves with false
     */
    // Given: 2 selected skills and dialog shown
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
      makeSkillCard('JavaScript', 'skill-2'),
    ];
    const dialogPromise = showConfirmationDialog(skills);

    // When: user presses Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    // Then: promise resolves with false
    const result = await dialogPromise;
    expect(result).toBe(false);
  });

  test('user_double_clicks_confirm_does_not_resolve_twice', async () => {
    /**
     * Given the confirmation dialog is open
     * When the user clicks Confirm twice rapidly
     * Then the promise resolves only once with true
     */
    // Given: dialog shown
    const skills = [
      makeSkillCard('TypeScript', 'skill-1'),
    ];
    const dialogPromise = showConfirmationDialog(skills);

    // When: user clicks Confirm, then clicks again
    const confirmBtn = document.querySelector('[data-testid="confirm-btn"]') as HTMLElement;
    confirmBtn.click();
    confirmBtn.click();

    // Then: promise resolves with true (only once)
    const result = await dialogPromise;
    expect(result).toBe(true);
  });
});

describe('ResultReporting', () => {
  /**
   * REQUIREMENT: After bulk deletion, the user must see a summary.
   *
   * WHO: The user — they need to know what succeeded and what failed
   * WHAT: (1) shows success message when all deletions succeed
   *       (2) shows partial success with failure details
   *       (3) shows "Unknown error" when a failure has no error message
   *       (4) includes rate-limiting note when applicable
   * WHY: Without feedback, the user doesn't know if the operation
   *      completed or which skills need manual attention.
   *
   * MOCK BOUNDARY:
   *   Mock:  BulkDeleteResult data
   *   Real:  DOM rendering of the summary via showResultSummary
   *   Never: The deletion logic
   */

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('user_sees_full_success_summary', () => {
    /**
     * Given all 5 deletions succeeded
     * When the result summary displays
     * Then it shows "Successfully deleted 5 skills"
     */
    // Given: all deletions succeeded
    const result: BulkDeleteResult = {
      total: 5,
      succeeded: 5,
      failed: 0,
      results: [],
      rateLimited: false,
    };

    // When: result summary is shown
    showResultSummary(result);

    // Then: success message is displayed
    const summaryText = document.querySelector('[data-testid="result-summary"]')?.textContent ?? '';
    expect(summaryText).toContain('Successfully deleted 5 skills');
  });

  test('user_sees_partial_success_with_failures', () => {
    /**
     * Given 3 of 5 deletions succeeded and 2 failed
     * When the result summary displays
     * Then it shows failure count and failed skill names
     */
    // Given: partial success
    const failedSkill1 = makeSkillCard('React', 'skill-4');
    const failedSkill2 = makeSkillCard('Node.js', 'skill-5');
    const result: BulkDeleteResult = {
      total: 5,
      succeeded: 3,
      failed: 2,
      results: [
        { skill: failedSkill1, success: false, error: 'Modal did not appear' },
        { skill: failedSkill2, success: false, error: 'Delete button not found' },
      ],
      rateLimited: false,
    };

    // When: result summary is shown
    showResultSummary(result);

    // Then: partial success message with failed skill names
    const summaryText = document.querySelector('[data-testid="result-summary"]')?.textContent ?? '';
    expect(summaryText).toContain('Deleted 3 of 5 skills');
    expect(summaryText).toContain('2 failed');
    expect(summaryText).toContain('React');
    expect(summaryText).toContain('Node.js');
  });

  test('user_sees_failure_with_missing_error_message', () => {
    /**
     * Given a deletion failed but the error field is undefined
     * When the result summary displays
     * Then it shows "Unknown error" for that skill
     */
    // Given: failure with no error message
    const failedSkill = makeSkillCard('React', 'skill-4');
    const result: BulkDeleteResult = {
      total: 1,
      succeeded: 0,
      failed: 1,
      results: [
        { skill: failedSkill, success: false },
      ],
      rateLimited: false,
    };

    // When: result summary is shown
    showResultSummary(result);

    // Then: shows unknown error
    const summaryText = document.querySelector('[data-testid="result-summary"]')?.textContent ?? '';
    expect(summaryText).toContain('Unknown error');
  });

  test('user_sees_rate_limiting_note', () => {
    /**
     * Given rate-limiting was encountered during deletion
     * When the result summary displays
     * Then it includes a note about rate-limiting
     */
    // Given: rate limiting was triggered
    const result: BulkDeleteResult = {
      total: 5,
      succeeded: 5,
      failed: 0,
      results: [],
      rateLimited: true,
    };

    // When: result summary is shown
    showResultSummary(result);

    // Then: rate-limiting note is shown
    const summaryText = document.querySelector('[data-testid="result-summary"]')?.textContent ?? '';
    expect(summaryText.toLowerCase()).toContain('rate');
  });
});
