/**
 * Content script entry point — page detection, queue processing, and initialization.
 *
 * LinkedIn does a full page reload after each skill deletion. This module
 * coordinates the deletion queue (persisted in sessionStorage via queue.ts)
 * across those reloads:
 *   1. Edit form page + queue → delete skill on this page, update queue
 *   2. Skills list page + queue → navigate to next edit form or show results
 *   3. Skills list page + no queue → normal mode (inject UI)
 */

import { getSkillCards, findButtonByText, waitFor } from './skills';
import { injectBulkDeleteUI, addNewSkills, showResultSummary, resetUIState } from './ui';
import { getDeletionState, setDeletionState, clearDeletionState } from './queue';
import { BulkDeleteResult } from './types';

const SKILLS_PAGE_PATTERN = /\/in\/[^/]+\/details\/skills/;
const EDIT_FORM_PATTERN = /\/in\/[^/]+\/details\/skills\/edit\/forms\/\d+/;
const SKILLS_CONTAINER_SELECTOR = 'div[componentkey*="SkillDetails"]';

/**
 * Returns true for the skills list page, false for edit form pages and other pages.
 */
export function isSkillsPage(url: string): boolean {
  return SKILLS_PAGE_PATTERN.test(url) && !EDIT_FORM_PATTERN.test(url);
}

/**
 * Returns true when the URL is a skill edit form page.
 */
export function isEditFormPage(url: string): boolean {
  return EDIT_FORM_PATTERN.test(url);
}

/** Guard against concurrent handleEditFormDeletion invocations. */
let deletionInProgress = false;

/**
 * Handles deletion on an edit form page when a queue is active.
 * Finds and clicks "Delete skill" → "Delete" confirm, then lets LinkedIn reload.
 */
async function handleEditFormDeletion(): Promise<void> {
  if (deletionInProgress) return;
  deletionInProgress = true;
  try {
    const state = getDeletionState();
    if (!state || state.queue.length === 0) return;

    const current = state.queue[0];
    console.log(`[LinkedIn Skills Bulk Delete] Deleting: ${current.name}`);

    const deleteBtn = await waitFor(() => findButtonByText('Delete skill'));
    if (!deleteBtn) {
      state.completed.push({ name: current.name, success: false, error: 'Delete button not found' });
      state.queue.shift();
      setDeletionState(state);
      window.history.back();
      return;
    }

    deleteBtn.click();

    const confirmBtn = await waitFor(() => findButtonByText('Delete'));
    if (!confirmBtn) {
      state.completed.push({ name: current.name, success: false, error: 'Confirm button not found' });
      state.queue.shift();
      setDeletionState(state);
      window.history.back();
      return;
    }

    // Record success BEFORE clicking — the page reloads after confirm
    state.completed.push({ name: current.name, success: true });
    state.queue.shift();
    setDeletionState(state);

    confirmBtn.click();
    // LinkedIn reloads → skills list → content script re-runs
  } finally {
    deletionInProgress = false;
  }
}

/**
 * Handles queue continuation on the skills list page.
 * Returns true if a queue was active (navigated or showed results), false otherwise.
 */
function handleSkillsPageQueue(): boolean {
  const state = getDeletionState();
  if (!state) return false;

  if (state.queue.length === 0) {
    // All done — show results
    const succeeded = state.completed.filter(c => c.success).length;
    const failed = state.completed.filter(c => !c.success).length;
    const result: BulkDeleteResult = {
      total: state.total,
      succeeded,
      failed,
      results: state.completed.map(c => ({
        skill: { element: document.createElement('div'), name: c.name, id: '', editUrl: '' },
        success: c.success,
        error: c.error,
      })),
      rateLimited: false,
    };
    clearDeletionState();
    showResultSummary(result);
    return true;
  }

  // Navigate to the next skill's edit form
  const next = state.queue[0];
  console.log(`[LinkedIn Skills Bulk Delete] Next: ${next.name}`);
  window.location.href = next.editUrl;
  return true;
}

/**
 * Watches the skills container for dynamically added skill cards (lazy-loading on scroll).
 */
function observeNewSkills(): void {
  const container = document.querySelector(SKILLS_CONTAINER_SELECTOR);
  if (!container) return;

  const observer = new MutationObserver(() => {
    const freshSkills = getSkillCards();
    if (freshSkills.length > 0) {
      addNewSkills(freshSkills);
    }
  });

  observer.observe(container, { childList: true, subtree: true });
}

/**
 * Polls for skill cards in the DOM and injects the bulk-delete UI once found.
 */
function pollForSkillsAndInjectUI(
  setIntervalFn: typeof setInterval = setInterval,
  clearIntervalFn: typeof clearInterval = clearInterval
): void {
  const maxAttempts = 20;
  let attempts = 0;
  const interval = setIntervalFn(() => {
    attempts++;
    const skills = getSkillCards();
    if (skills.length > 0) {
      clearIntervalFn(interval);
      console.log(`[LinkedIn Skills Bulk Delete] Found ${skills.length} skills, injecting UI`);
      injectBulkDeleteUI(skills);
      observeNewSkills();
    } else if (attempts >= maxAttempts) {
      clearIntervalFn(interval);
      console.log('[LinkedIn Skills Bulk Delete] No skills found after polling');
    }
  }, 500);
}

/**
 * Initializes the content script.
 * Detects the page type and either processes the deletion queue or injects the UI.
 */
export function initialize(
  locationHref: string = window.location.href,
  setIntervalFn: typeof setInterval = setInterval,
  clearIntervalFn: typeof clearInterval = clearInterval
): void {
  // Edit form page — perform deletion if queue is active
  if (isEditFormPage(locationHref)) {
    handleEditFormDeletion();
    return;
  }

  if (!isSkillsPage(locationHref)) return;

  console.log('[LinkedIn Skills Bulk Delete] Skills page detected');

  // Check for a pending deletion queue (resuming after a page reload)
  if (handleSkillsPageQueue()) return;

  // Normal flow — poll for skills and inject UI
  pollForSkillsAndInjectUI(setIntervalFn, clearIntervalFn);
}

/**
 * Watches for SPA (client-side) navigation by polling window.location.href.
 *
 * LinkedIn uses client-side routing — after a skill deletion the page
 * transitions back to the skills list without a full reload, so the
 * content script's top-level `initialize()` never re-runs.  This watcher
 * detects those transitions and dispatches to the appropriate handler.
 */
function startUrlWatcher(): void {
  let lastUrl = window.location.href;
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;

    if (isEditFormPage(currentUrl)) {
      handleEditFormDeletion();
    } else if (isSkillsPage(currentUrl)) {
      handleSkillsPageQueue();
      // Re-inject toolbar + checkboxes (stale toolbar is removed first;
      // result summary, if any, stays visible on top).
      document.querySelector('[data-testid="bulk-delete-toolbar"]')?.remove();
      resetUIState();
      pollForSkillsAndInjectUI();
    }
  }, 500);
}

// Run in browser context only
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initialize();
  startUrlWatcher();
}
