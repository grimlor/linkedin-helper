/**
 * Deletion queue state management — persists across page reloads via sessionStorage.
 *
 * LinkedIn does a full page reload after each skill deletion, destroying the
 * JavaScript execution context. This module persists the queue so the content
 * script can resume processing after each reload.
 */

import { SkillCard } from './types';

const STORAGE_KEY = 'linkedin-bulk-delete-state';

export interface QueueItem {
  id: string;
  name: string;
  editUrl: string;
}

export interface CompletedItem {
  name: string;
  success: boolean;
  error?: string;
}

export interface DeletionState {
  queue: QueueItem[];
  completed: CompletedItem[];
  total: number;
}

export function getDeletionState(): DeletionState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setDeletionState(state: DeletionState): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearDeletionState(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * Saves the selected skills as a deletion queue and navigates to the first
 * skill's edit form to begin the deletion flow.
 */
export function startDeletionQueue(
  skills: SkillCard[],
  navigate: (url: string) => void = url => { window.location.href = url; }
): void {
  if (skills.length === 0) return;
  const state: DeletionState = {
    queue: skills.map(s => ({ id: s.id, name: s.name, editUrl: s.editUrl })),
    completed: [],
    total: skills.length,
  };
  setDeletionState(state);
  navigate(state.queue[0].editUrl);
}
