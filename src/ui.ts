/**
 * UI injection — checkboxes, toolbar, confirmation dialog, result summary.
 */

import { SkillCard, BulkDeleteResult } from './types';
import { startDeletionQueue } from './queue';

/** Module-level registry of skills managed by the injected UI. */
let registeredSkills: SkillCard[] = [];

/**
 * Updates the toolbar button text with the current selection count.
 */
function updateDeleteButtonCount(): void {
  const btn = document.querySelector('[data-testid="delete-selected-btn"]');
  if (btn) {
    const count = getSelectedSkills().length;
    btn.textContent = `Delete Selected (${count})`;
  }
}

/** Set of skill IDs already injected with checkboxes. */
const injectedIds = new Set<string>();

/**
 * Resets module-level state. Exported for testing only.
 */
export function resetUIState(): void {
  registeredSkills = [];
  injectedIds.clear();
}

/**
 * Injects a checkbox before a skill's edit link element.
 */
function injectCheckbox(skill: SkillCard): void {
  if (injectedIds.has(skill.id)) return;
  injectedIds.add(skill.id);
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.skillId = skill.id;
  checkbox.style.cursor = 'pointer';
  checkbox.addEventListener('change', updateDeleteButtonCount);
  skill.element.parentElement?.insertBefore(checkbox, skill.element);
}

/**
 * Adds checkboxes to each skill card and a bulk-delete toolbar.
 */
export function injectBulkDeleteUI(skills: SkillCard[]): void {
  registeredSkills = skills;

  // Add a checkbox before each skill's edit link (not inside the <a>,
  // which would make clicks navigate to the edit form page).
  skills.forEach(injectCheckbox);

  // Remove existing toolbar if present (SPA navigation can leave stale elements)
  document.querySelector('[data-testid="bulk-delete-toolbar"]')?.remove();

  // Create the toolbar
  const toolbar = document.createElement('div');
  toolbar.dataset.testid = 'bulk-delete-toolbar';
  toolbar.style.cssText = [
    'position: fixed',
    'bottom: 0',
    'left: 0',
    'right: 0',
    'background: #fff',
    'border-top: 2px solid #0a66c2',
    'padding: 8px 16px',
    'display: flex',
    'gap: 8px',
    'align-items: center',
    'z-index: 9999',
    'box-shadow: 0 -2px 8px rgba(0,0,0,0.15)',
  ].join('; ');

  const selectAllBtn = document.createElement('button');
  selectAllBtn.dataset.testid = 'select-all-btn';
  selectAllBtn.textContent = 'Select All';
  selectAllBtn.style.cssText = 'padding: 6px 12px; cursor: pointer; border: 1px solid #0a66c2; border-radius: 16px; background: #fff; color: #0a66c2; font-weight: 600;';
  selectAllBtn.addEventListener('click', () => {
    registeredSkills.forEach(skill => {
      const cb = document.querySelector(`input[data-skill-id="${skill.id}"]`) as HTMLInputElement | null;
      if (cb) cb.checked = true;
    });
    updateDeleteButtonCount();
  });

  const deselectAllBtn = document.createElement('button');
  deselectAllBtn.dataset.testid = 'deselect-all-btn';
  deselectAllBtn.textContent = 'Deselect All';
  deselectAllBtn.style.cssText = 'padding: 6px 12px; cursor: pointer; border: 1px solid #666; border-radius: 16px; background: #fff; color: #666; font-weight: 600;';
  deselectAllBtn.addEventListener('click', () => {
    registeredSkills.forEach(skill => {
      const cb = document.querySelector(`input[data-skill-id="${skill.id}"]`) as HTMLInputElement | null;
      if (cb) cb.checked = false;
    });
    updateDeleteButtonCount();
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.dataset.testid = 'delete-selected-btn';
  deleteBtn.textContent = 'Delete Selected (0)';
  deleteBtn.style.cssText = 'padding: 6px 12px; cursor: pointer; border: none; border-radius: 16px; background: #cc1016; color: #fff; font-weight: 600; margin-left: auto;';
  deleteBtn.addEventListener('click', async () => {
    console.log('[LinkedIn Skills Bulk Delete] Delete button clicked');
    const selected = getSelectedSkills();
    console.log(`[LinkedIn Skills Bulk Delete] Selected skills: ${selected.length}`);
    if (selected.length === 0) return;
    const confirmed = await showConfirmationDialog(selected);
    console.log(`[LinkedIn Skills Bulk Delete] Confirmation result: ${confirmed}`);
    if (!confirmed) return;
    startDeletionQueue(selected);
  });

  toolbar.appendChild(selectAllBtn);
  toolbar.appendChild(deselectAllBtn);
  toolbar.appendChild(deleteBtn);
  document.body.appendChild(toolbar);
}

/**
 * Returns the list of currently-checked skill cards.
 */
export function getSelectedSkills(): SkillCard[] {
  return registeredSkills.filter(skill => {
    const cb = document.querySelector(`input[data-skill-id="${skill.id}"]`) as HTMLInputElement | null;
    return cb?.checked === true;
  });
}

/**
 * Registers newly discovered skills (from lazy-loading) and injects checkboxes.
 * Skips skills that were already registered.
 */
export function addNewSkills(skills: SkillCard[]): void {
  for (const skill of skills) {
    if (!injectedIds.has(skill.id)) {
      registeredSkills.push(skill);
      injectCheckbox(skill);
    }
  }
}

/**
 * Displays a confirmation dialog listing skills to be deleted.
 * Resolves true if user confirms, false if they cancel.
 */
export function showConfirmationDialog(skills: SkillCard[]): Promise<boolean> {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.dataset.testid = 'confirmation-dialog';
    overlay.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'right: 0',
      'bottom: 0',
      'background: rgba(0,0,0,0.6)',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'z-index: 10000',
    ].join('; ');

    const card = document.createElement('div');
    card.style.cssText = 'background: #fff; border-radius: 8px; padding: 24px; max-width: 400px; width: 90%; max-height: 60vh; overflow-y: auto; box-shadow: 0 4px 16px rgba(0,0,0,0.3); font-size: 16px;';

    const heading = document.createElement('h3');
    heading.textContent = `Delete ${skills.length} skills?`;
    heading.style.cssText = 'margin: 0 0 16px 0; color: #191919; font-size: 20px;';
    card.appendChild(heading);

    const list = document.createElement('ul');
    list.style.cssText = 'padding-left: 20px; margin: 0 0 16px 0; color: #333;';
    skills.forEach(skill => {
      const li = document.createElement('li');
      li.textContent = skill.name;
      list.appendChild(li);
    });
    card.appendChild(list);

    let resolved = false;
    const cleanup = (result: boolean): void => {
      if (resolved) return;
      resolved = true;
      document.removeEventListener('keydown', onEscape);
      overlay.remove();
      resolve(result);
    };

    const confirmBtn = document.createElement('button');
    confirmBtn.dataset.testid = 'confirm-btn';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.style.cssText = 'padding: 8px 16px; cursor: pointer; border: none; border-radius: 16px; background: #cc1016; color: #fff; font-weight: 600; margin-right: 8px;';
    confirmBtn.addEventListener('click', () => cleanup(true));

    const cancelBtn = document.createElement('button');
    cancelBtn.dataset.testid = 'cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding: 8px 16px; cursor: pointer; border: 1px solid #666; border-radius: 16px; background: #fff; color: #666; font-weight: 600;';
    cancelBtn.addEventListener('click', () => cleanup(false));

    const onEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cleanup(false);
    };
    document.addEventListener('keydown', onEscape);

    card.appendChild(confirmBtn);
    card.appendChild(cancelBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  });
}

/**
 * Displays a summary of the bulk delete operation results.
 */
export function showResultSummary(result: BulkDeleteResult): void {
  const summary = document.createElement('div');
  summary.dataset.testid = 'result-summary';
  summary.style.cssText = [
    'position: fixed',
    'top: 50%',
    'left: 50%',
    'transform: translate(-50%, -50%)',
    'background: #fff',
    'border-radius: 8px',
    'padding: 24px',
    'max-width: 400px',
    'width: 90%',
    'z-index: 10000',
    'box-shadow: 0 4px 16px rgba(0,0,0,0.3)',
    'font-size: 16px',
  ].join('; ');

  if (result.failed === 0) {
    const msg = document.createElement('p');
    msg.textContent = `Successfully deleted ${result.succeeded} skills`;
    summary.appendChild(msg);
  } else {
    const msg = document.createElement('p');
    msg.textContent = `Deleted ${result.succeeded} of ${result.total} skills. ${result.failed} failed:`;
    summary.appendChild(msg);

    const failedList = document.createElement('ul');
    result.results
      .filter(r => !r.success)
      .forEach(r => {
        const li = document.createElement('li');
        li.textContent = `${r.skill.name}: ${r.error ?? 'Unknown error'}`;
        failedList.appendChild(li);
      });
    summary.appendChild(failedList);
  }

  if (result.rateLimited) {
    const note = document.createElement('p');
    note.textContent = 'Note: Rate limiting was detected during deletion. Some operations were delayed.';
    summary.appendChild(note);
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.dataset.testid = 'dismiss-btn';
  dismissBtn.style.cssText = 'padding: 8px 16px; cursor: pointer; border: 1px solid #666; border-radius: 16px; background: #fff; color: #666; font-weight: 600; margin-top: 12px;';
  dismissBtn.addEventListener('click', () => summary.remove());
  summary.appendChild(dismissBtn);

  document.body.appendChild(summary);
}
