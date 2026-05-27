import type { MashroomPortalService } from '@mashroom/mashroom-portal/type-definitions';

/** Resolve an i18n string to a single display value. */
export function resolveTitle(
  title: string | Record<string, string> | null | undefined,
  fallback = '(no title)',
): string {
  if (typeof title === 'string') return title;
  if (title?.de) return title.de;
  if (title?.en) return title.en;
  const keys = Object.keys(title ?? {});
  return keys.length > 0
    ? (title as Record<string, string>)[keys[0]]
    : fallback;
}

/** Find a site by partial path match. */
export async function findSiteByPath(
  portalService: MashroomPortalService,
  sitePath: string,
) {
  const sites = await portalService.getSites();
  return sites.find((site) => site.path.includes(sitePath)) ?? null;
}

/**
 * Sanitize a user-provided string to prevent XSS and injection.
 * - Removes HTML tags
 * - Escapes special characters that could be used in injection attacks
 * - Limits length to prevent buffer abuse
 */
export function sanitizeInput(input: string, maxLength = 10000): string {
  if (typeof input !== 'string') return '';

  // Truncate to max length
  let sanitized = input.slice(0, maxLength);

  // Remove HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Escape special characters that could be used in template injection
  sanitized = sanitized.replace(/\{/g, '\\{').replace(/\}/g, '\\}');

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  return sanitized;
}

/**
 * Sanitize CSS input to prevent style injection attacks.
 * Allows only safe CSS patterns and removes dangerous functions/properties.
 */
export function sanitizeCss(input: string, maxLength = 5000): string {
  const sanitized = sanitizeInput(input, maxLength);

  // Remove dangerous CSS patterns
  return sanitized
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/@import/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/-moz-binding\s*:/gi, '');
}

/**
 * Sanitize a URL path to prevent path traversal.
 */
export function sanitizePath(input: string): string {
  const sanitized = sanitizeInput(input, 256);

  // Prevent path traversal
  let result = sanitized.replace(/\.\./g, '');

  // Ensure it starts with / for paths
  if (result && !result.startsWith('/')) {
    result = `/${result}`;
  }

  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally removing control chars
  result = result.replace(/[\x00-\x1f]/g, '');

  return result;
}

/**
 * Sanitize a JSON string to ensure it's valid and doesn't exceed size limits.
 */
export function sanitizeJson(
  input: string,
  maxSize = 1_000_000,
): Record<string, unknown> {
  if (input.length > maxSize) {
    throw new Error('JSON input exceeds maximum size');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error('Invalid JSON input');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('JSON input must be an object');
  }

  return parsed as Record<string, unknown>;
}
