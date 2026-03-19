/**
 * Type definitions for LinkedIn Skills Bulk Delete extension.
 */

export interface SkillCard {
  element: HTMLElement;     // The DOM element for this skill's name <p> tag
  name: string;             // The display name of the skill
  id: string;               // Numeric skill ID extracted from the edit link href
  editUrl: string;          // Full URL to the skill edit form page
}

export interface DeleteResult {
  skill: SkillCard;
  success: boolean;
  error?: string;
}

export interface BulkDeleteResult {
  total: number;
  succeeded: number;
  failed: number;
  results: DeleteResult[];
  rateLimited: boolean;
}

export interface ThrottleOptions {
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}
