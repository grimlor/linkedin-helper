/**
 * Type definitions for LinkedIn Skills Bulk Delete extension.
 */

export interface SkillCard {
  element: HTMLElement;     // The edit link <a> element for this skill
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