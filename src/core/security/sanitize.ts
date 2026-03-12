const HTML_TAG_REGEX = /<[^>]*>/g;
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const MULTI_SPACE_REGEX = /\s{2,}/g;

const MAX_QUERY_LENGTH = 500;

export interface SanitizeResult {
  text: string;
  rejected: boolean;
  reason?: string;
}

export function sanitizeInput(raw: string): SanitizeResult {
  if (!raw || typeof raw !== 'string') {
    return { text: '', rejected: true, reason: 'Empty or invalid input' };
  }

  // Strip HTML tags
  let text = raw.replace(HTML_TAG_REGEX, '');

  // Strip control characters (keep newlines and tabs)
  text = text.replace(CONTROL_CHAR_REGEX, '');

  // Collapse whitespace
  text = text.replace(MULTI_SPACE_REGEX, ' ').trim();

  if (text.length === 0) {
    return { text: '', rejected: true, reason: 'Input is empty after sanitization' };
  }

  // Reject queries that are too short to be meaningful (e.g., "?", "a")
  const alphanumCount = (text.match(/[a-zA-Z0-9]/g) || []).length;
  if (alphanumCount < 2) {
    return { text: '', rejected: true, reason: 'Input is too short to be a meaningful question' };
  }

  if (text.length > MAX_QUERY_LENGTH) {
    return { text: '', rejected: true, reason: `Input exceeds ${MAX_QUERY_LENGTH} characters` };
  }

  return { text, rejected: false };
}
