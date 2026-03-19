/**
 * Skill card discovery and single-skill deletion logic.
 */

import { SkillCard, DeleteResult } from './types';

const SKILLS_CONTAINER_SELECTOR = 'div[componentkey*="SkillDetails"]';
const EDIT_LINK_SELECTOR = 'a[href*="/details/skills/edit/forms/"]';
const SKILL_ID_PATTERN = /\/edit\/forms\/(\d+)\/?$/;

/**
 * Finds the nearest skill name <p> element for a given edit link.
 * Walks up the DOM from the edit link to find a sibling/cousin <p> that
 * contains the skill name (short text, not a description).
 */
function findSkillNameForEditLink(editLink: HTMLElement): string {
  // Walk up to find a common ancestor, then look for <p> tags
  let ancestor = editLink.parentElement;
  for (let i = 0; i < 5 && ancestor; i++) {
    const paragraphs = Array.from(ancestor.querySelectorAll('p'));
    for (const p of paragraphs) {
      const text = p.textContent;
      if (!text) continue;
      const trimmed = text.trim();
      // Skill names are short and don't contain "experience" descriptions
      if (trimmed.length > 0 && trimmed.length < 80 && !/experience/i.test(trimmed)) {
        return trimmed;
      }
    }
    ancestor = ancestor.parentElement;
  }
  return '';
}

/**
 * Queries the DOM for all skill entries and returns a structured list.
 * Uses the skills container (div[componentkey*="SkillDetails"]) and
 * edit links (a[href*="/details/skills/edit/forms/"]) as stable anchors.
 */
export function getSkillCards(): SkillCard[] {
  const container = document.querySelector(SKILLS_CONTAINER_SELECTOR);
  if (!container) return [];

  const editLinks = container.querySelectorAll(EDIT_LINK_SELECTOR);
  const skills: SkillCard[] = [];

  editLinks.forEach(link => {
    // href is guaranteed non-null by the CSS selector a[href*="..."]
    const href = link.getAttribute('href')!;
    const match = href.match(SKILL_ID_PATTERN);
    if (!match) return;

    const id = match[1];
    const name = findSkillNameForEditLink(link as HTMLElement);
    if (!name) return;

    skills.push({
      element: link as HTMLElement,
      name,
      id,
      editUrl: href,
    });
  });

  return skills;
}

/**
 * Finds a button by its visible text content.
 */
export function findButtonByText(text: string, root: Document | Element = document): HTMLButtonElement | null {
  const buttons = Array.from(root.querySelectorAll('button'));
  for (const btn of buttons) {
    if (btn.textContent?.trim() === text) {
      return btn;
    }
  }
  return null;
}

/**
 * Waits for a condition to become true, polling at intervals.
 * Returns the result of the predicate, or null if it times out.
 */
export function waitFor<T>(
  predicate: () => T | null,
  intervalMs = 300,
  timeoutMs = 10000
): Promise<T | null> {
  return new Promise(resolve => {
    const start = Date.now();
    const check = (): void => {
      const result = predicate();
      if (result) {
        resolve(result);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

/**
 * Executes the deletion flow for one skill on the edit form page.
 * Assumes the edit form page is already loaded.
 * Flow: find "Delete skill" button → click → find "Delete" confirm → click.
 */
export async function deleteSingleSkill(skill: SkillCard): Promise<DeleteResult> {
  // Wait for the "Delete skill" button to appear on the edit form
  const deleteSkillBtn = await waitFor(() => findButtonByText('Delete skill'));
  if (!deleteSkillBtn) {
    return { skill, success: false, error: 'Delete button not found' };
  }

  // Click "Delete skill"
  deleteSkillBtn.click();

  // Wait for the "Delete" confirmation button to appear
  const confirmBtn = await waitFor(() => findButtonByText('Delete'));
  if (!confirmBtn) {
    return { skill, success: false, error: 'Confirm button not found' };
  }

  // Click "Delete" to confirm
  confirmBtn.click();

  return { skill, success: true };
}
