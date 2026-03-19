/**
 * BDD Tests for LinkedIn Skills Bulk Delete — Skill Card Discovery & Deletion
 * Following .github/skills/bdd-testing/SKILL.md principles
 *
 * Covers: SkillCardDiscovery, SingleSkillDeletion
 */

// Public API surface (from src/skills.ts):
//   getSkillCards(): SkillCard[]
//   deleteSingleSkill(skill: SkillCard): Promise<DeleteResult>

import { getSkillCards, deleteSingleSkill } from '../src/skills';
import { SkillCard } from '../src/types';

/**
 * Helper to build fixture HTML matching LinkedIn's real SDUI structure.
 * Each skill entry has a name <p> and a nearby edit <a> with href containing the skill ID.
 */
function buildSkillEntry(name: string, id: string): string {
  return `
    <div class="beeac30f a5921d00 _91bc9763">
      <div class="_91bc9763 _88c82e37 a5efacda">
        <div class="beeac30f _3df979da ef615a28">
          <div class="_97d6d0a5 _6c9bb917 _88ffc918">
            <p class="_2da93252 _48505232 a5ac7cc3">${name}</p>
          </div>
        </div>
        <a aria-label="Edit skill" href="https://www.linkedin.com/in/testuser/details/skills/edit/forms/${id}/">
          <svg id="edit-medium"></svg>
        </a>
      </div>
    </div>
  `;
}

describe('SkillCardDiscovery', () => {
  /**
   * REQUIREMENT: The extension must discover all skill entries on the page.
   *
   * WHO: The UI injection logic — it needs the full list before rendering checkboxes
   * WHAT: (1) returns all skill entries with correct names when edit links exist
   *       (2) returns an empty array when no edit links exist
   *       (3) extracts the correct display name and ID from each skill entry
   *       (4) returns an empty array when the skills container is not present
   *       (5) skips edit links that have no nearby skill name <p> tag
   *       (6) skips edit links with href not matching the expected pattern
   * WHY: Without a reliable list of skills, the extension cannot offer
   *      selection or deletion.
   *
   * MOCK BOUNDARY:
   *   Mock:  DOM structure (provide fixture HTML matching real LinkedIn SDUI structure)
   *   Real:  DOM querying, data extraction via getSkillCards
   *   Never: Network requests
   */

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('user_views_page_with_multiple_skills', () => {
    /**
     * Given the skills container has 5 edit links with corresponding skill name <p> tags
     * When getSkillCards is called
     * Then it returns an array of 5 SkillCard objects with correct names
     */
    // Given: 5 skill entries in the skills container
    document.body.innerHTML = `
      <div componentkey="com.linkedin.sdui.profile.card.refACoAAABdF48SkillDetails">
        ${buildSkillEntry('TypeScript', '59')}
        ${buildSkillEntry('JavaScript', '60')}
        ${buildSkillEntry('Python', '61')}
        ${buildSkillEntry('React', '62')}
        ${buildSkillEntry('Node.js', '63')}
      </div>
    `;

    // When: skill cards are queried
    const skills = getSkillCards();

    // Then: 5 skill cards are returned
    expect(skills).toHaveLength(5);
  });

  test('user_views_page_with_no_skills', () => {
    /**
     * Given the skills container exists but has no edit links
     * When getSkillCards is called
     * Then it returns an empty array
     */
    // Given: empty skills container
    document.body.innerHTML = `
      <div componentkey="com.linkedin.sdui.profile.card.refACoAAABdF48SkillDetails">
      </div>
    `;

    // When: skill cards are queried
    const skills = getSkillCards();

    // Then: empty array is returned
    expect(skills).toHaveLength(0);
  });

  test('user_views_page_and_skill_names_and_ids_are_extracted', () => {
    /**
     * Given a skill name <p> contains "TypeScript" and edit link href ends with /edit/forms/59/
     * When getSkillCards is called
     * Then the corresponding SkillCard has name "TypeScript", id "59", and correct editUrl
     */
    // Given: a single skill entry
    document.body.innerHTML = `
      <div componentkey="com.linkedin.sdui.profile.card.refACoAAABdF48SkillDetails">
        ${buildSkillEntry('TypeScript', '59')}
      </div>
    `;

    // When: skill cards are queried
    const skills = getSkillCards();

    // Then: the skill name, ID, and editUrl are correctly extracted
    expect(skills[0].name).toBe('TypeScript');
    expect(skills[0].id).toBe('59');
    expect(skills[0].editUrl).toContain('/edit/forms/59/');
  });

  test('user_views_page_before_skills_container_loads', () => {
    /**
     * Given the skills container has not loaded yet (returns null)
     * When getSkillCards is called
     * Then it returns an empty array
     */
    // Given: no skills container in the DOM
    document.body.innerHTML = '<div>Some other content</div>';

    // When: skill cards are queried
    const skills = getSkillCards();

    // Then: empty array is returned
    expect(skills).toHaveLength(0);
  });

  test('user_views_page_with_edit_link_but_no_skill_name', () => {
    /**
     * Given an edit link exists but no nearby <p> tag with a skill name
     * When getSkillCards is called
     * Then that entry is skipped and not included in the results
     */
    // Given: edit link with no accompanying skill name (only empty <p> tags)
    document.body.innerHTML = `
      <div componentkey=\"com.linkedin.sdui.profile.card.refACoAAABdF48SkillDetails\">
        <div>
          <div><p></p></div>
          <a aria-label="Edit skill" href="https://www.linkedin.com/in/testuser/details/skills/edit/forms/99/">
            <svg id="edit-medium"></svg>
          </a>
        </div>
      </div>
    `;

    // When: skill cards are queried
    const skills = getSkillCards();

    // Then: no skills returned (edit link has no name to pair with)
    expect(skills).toHaveLength(0);
  });

  test('user_views_page_with_edit_link_with_malformed_href', () => {
    /**
     * Given an edit link exists but its href does not match the expected pattern
     * When getSkillCards is called
     * Then that entry is skipped
     */
    // Given: edit link with href that matches CSS selector but not the ID regex
    document.body.innerHTML = `
      <div componentkey="com.linkedin.sdui.profile.card.refACoAAABdF48SkillDetails">
        <div>
          <div><p class="_48505232">TypeScript</p></div>
          <a href="https://www.linkedin.com/in/testuser/details/skills/edit/forms/new/">
            <svg id="edit-medium"></svg>
          </a>
        </div>
      </div>
    `;

    // When: skill cards are queried
    const skills = getSkillCards();

    // Then: no skills returned (href doesn't match /edit/forms/{id}/ pattern)
    expect(skills).toHaveLength(0);
  });
});

describe('SingleSkillDeletion', () => {
  /**
   * REQUIREMENT: The extension must delete one skill through LinkedIn's edit form page flow.
   *
   * WHO: The content script — it calls this on the edit form page
   * WHAT: (1) finds "Delete skill" button, clicks it, confirms, returns success
   *       (2) returns failure if "Delete skill" button does not appear
   *       (3) returns failure if "Delete" confirm button does not appear
   * WHY: This is the atomic unit of deletion on the edit form page.
   *
   * MOCK BOUNDARY:
   *   Mock:  DOM structure (edit form page with delete/confirm buttons)
   *   Real:  DOM querying, click simulation, polling via waitFor
   *   Never: Actual network requests to LinkedIn's API
   */

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('user_deletes_single_skill_successfully', async () => {
    /**
     * Given the edit form page has "Delete skill" and "Delete" confirm buttons
     * When deleteSingleSkill is called
     * Then it returns { success: true }
     */
    // Given: edit form page DOM with delete and confirm buttons
    document.body.innerHTML = `
      <div>
        <button type="button">Dismiss</button>
        <button type="button">Delete skill</button>
        <button type="button">Save</button>
      </div>
    `;
    // The confirm "Delete" button appears after clicking "Delete skill"
    const deleteSkillBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Delete skill')!;
    deleteSkillBtn.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.innerHTML = '<button type="button">No thanks</button><button type="button">Delete</button>';
      document.body.appendChild(overlay);
    });

    const el = document.createElement('a');
    const skill: SkillCard = { element: el, name: 'TypeScript', id: '59', editUrl: '/in/user/details/skills/edit/forms/59/' };

    // When: single skill deletion is triggered
    const result = await deleteSingleSkill(skill);

    // Then: deletion succeeds
    expect(result.success).toBe(true);
  });

  test('user_deletes_skill_but_delete_button_not_found', async () => {
    /**
     * Given the edit form page does not have a "Delete skill" button
     * When deleteSingleSkill is called
     * Then it returns { success: false, error: "Delete button not found" }
     */
    // Given: form page without delete button
    document.body.innerHTML = `
      <div>
        <button type="button">Dismiss</button>
        <button type="button">Save</button>
      </div>
    `;

    const el = document.createElement('a');
    const skill: SkillCard = { element: el, name: 'TypeScript', id: '59', editUrl: '/in/user/details/skills/edit/forms/59/' };

    // When: single skill deletion is triggered (will time out polling)
    const result = await deleteSingleSkill(skill);

    // Then: deletion fails
    expect(result.success).toBe(false);
    expect(result.error).toContain('Delete button not found');
  }, 15000);

  test('user_deletes_skill_but_confirm_button_not_found', async () => {
    /**
     * Given "Delete skill" is clicked but the "Delete" confirm button does not appear
     * When deleteSingleSkill is called
     * Then it returns { success: false, error: "Confirm button not found" }
     */
    // Given: form page with delete button but no confirm appears after clicking
    document.body.innerHTML = `
      <div>
        <button type="button">Dismiss</button>
        <button type="button">Delete skill</button>
        <button type="button">Save</button>
      </div>
    `;
    // Don't add a click handler — no confirm overlay will appear

    const el = document.createElement('a');
    const skill: SkillCard = { element: el, name: 'TypeScript', id: '59', editUrl: '/in/user/details/skills/edit/forms/59/' };

    // When: single skill deletion is triggered
    const result = await deleteSingleSkill(skill);

    // Then: deletion fails — confirm not found
    expect(result.success).toBe(false);
    expect(result.error).toContain('Confirm button not found');
  }, 15000);
});
