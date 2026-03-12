/**
 * Prompt injection detection.
 *
 * Scans user input for known injection patterns before it reaches the LLM.
 * Returns true if the input is suspicious.
 */

const INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Instruction override attempts
  { pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/i, label: 'instruction_override' },
  { pattern: /disregard\s+(all\s+)?(previous|above|your)\s+(instructions|prompts|rules)/i, label: 'instruction_override' },
  { pattern: /forget\s+(all\s+)?(previous|above|your)\s+(instructions|rules)/i, label: 'instruction_override' },
  { pattern: /do\s+not\s+follow\s+(your|the)\s+(previous|original)/i, label: 'instruction_override' },

  // Role-play / persona hijacking
  { pattern: /pretend\s+(you\s+are|to\s+be|you're)/i, label: 'role_hijack' },
  { pattern: /act\s+as\s+(if\s+you|a|an|though)/i, label: 'role_hijack' },
  { pattern: /you\s+are\s+now\s+a/i, label: 'role_hijack' },
  { pattern: /switch\s+to\s+.{0,20}\s+mode/i, label: 'role_hijack' },
  { pattern: /enter\s+.{0,20}\s+mode/i, label: 'role_hijack' },

  // System prompt extraction
  { pattern: /what\s+(is|are)\s+your\s+(system\s+)?prompt/i, label: 'prompt_extraction' },
  { pattern: /repeat\s+(your|the)\s+(system\s+)?(instructions|prompt|rules)/i, label: 'prompt_extraction' },
  { pattern: /show\s+(me\s+)?(your|the)\s+(system\s+)?(instructions|prompt)/i, label: 'prompt_extraction' },
  { pattern: /reveal\s+(your|the)\s+(system|hidden)\s+(prompt|instructions)/i, label: 'prompt_extraction' },
  { pattern: /what\s+were\s+you\s+told/i, label: 'prompt_extraction' },

  // Delimiter injection (trying to break out of context block)
  { pattern: /---\s*\n\s*(system|assistant|user)\s*:/i, label: 'delimiter_injection' },
  { pattern: /\[INST\]/i, label: 'delimiter_injection' },
  { pattern: /<\/?system>/i, label: 'delimiter_injection' },

  // Jailbreak patterns
  { pattern: /DAN\s*(mode|prompt)/i, label: 'jailbreak' },
  { pattern: /developer\s+mode/i, label: 'jailbreak' },
  { pattern: /bypass\s+(safety|content|filter)/i, label: 'jailbreak' },
];

export interface GuardrailResult {
  safe: boolean;
  flagged: boolean;
  label?: string;
  matchedPattern?: string;
}

export function checkPromptInjection(input: string): GuardrailResult {
  for (const { pattern, label } of INJECTION_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      return {
        safe: false,
        flagged: true,
        label,
        matchedPattern: match[0],
      };
    }
  }

  return { safe: true, flagged: false };
}

/**
 * Validate LLM output — ensure it doesn't leak system prompt or internal info.
 */
export function validateOutput(output: string, systemPrompt: string): boolean {
  // Check if output contains large chunks of the system prompt
  const promptWords = systemPrompt.split(/\s+/).filter(w => w.length > 5);
  const consecutiveMatches = countConsecutiveMatches(output.toLowerCase(), promptWords.map(w => w.toLowerCase()));

  // If 5+ consecutive system prompt words appear in output, it's likely leaking
  if (consecutiveMatches >= 5) {
    return false;
  }

  return true;
}

function countConsecutiveMatches(text: string, words: string[]): number {
  let maxConsecutive = 0;
  let current = 0;

  for (const word of words) {
    if (text.includes(word)) {
      current++;
      maxConsecutive = Math.max(maxConsecutive, current);
    } else {
      current = 0;
    }
  }

  return maxConsecutive;
}
