/**
 * Lightweight typo correction for domain-specific terms.
 * No external dependencies — just a curated map of common misspellings
 * and fuzzy matching for Veent-specific vocabulary.
 */

// Domain-specific corrections: misspelling → correct term
const DOMAIN_CORRECTIONS: Record<string, string> = {
  // Brand (no standalone 'vent' — it matches inside 'events', 'adventure', etc.)
  'veent tiks': 'veent tix',
  'vent tix': 'veent tix',
  'veent tics': 'veent tix',
  'veenttix': 'veent tix',
  'veent ticket': 'veent tix',
  'veent tickets': 'veent tix',
  'veeent': 'veent',

  // Payment methods
  'gcash': 'GCash',
  'g-cash': 'GCash',
  'g cash': 'GCash',
  'geecash': 'GCash',
  'paymaya': 'Maya',
  'pay maya': 'Maya',

  // Actions
  'refound': 'refund',
  'refun': 'refund',
  'refuns': 'refund',
  'reufnd': 'refund',
  'tickt': 'ticket',
  'tickts': 'tickets',
  'tiket': 'ticket',
  'tikets': 'tickets',
  'tickect': 'ticket',
  'tickects': 'tickets',
  'evnt': 'event',
  'evnts': 'events',
  'evetn': 'event',
  'evetns': 'events',
  'acount': 'account',
  'accout': 'account',
  'acconut': 'account',
  'acocunt': 'account',
  'pasword': 'password',
  'passwrod': 'password',
  'dashbord': 'dashboard',
  'dashbaord': 'dashboard',

  // Navigation
  'sing in': 'sign in',
  'signin': 'sign in',
  'sigin': 'sign in',
  'sgin in': 'sign in',
  'sin in': 'sign in',
  'sing up': 'sign up',
  'signup': 'sign up',
  'sigup': 'sign up',
  'sgin up': 'sign up',
  'loign': 'login',
  'logen': 'login',
  'logn': 'login',
  'log-in': 'login',

  // Common Tagalog misspellings
  'pano': 'paano',
  'san': 'saan',
  'bibili': 'bumili',
  'bayaran': 'mag-bayad',
};

// Generic word-level corrections for common typos
const WORD_CORRECTIONS: Record<string, string> = {
  'byu': 'buy',
  'biy': 'buy',
  'buiy': 'buy',
  'purchas': 'purchase',
  'purchse': 'purchase',
  'purcahse': 'purchase',
  'cancle': 'cancel',
  'cancl': 'cancel',
  'cansel': 'cancel',
  'cancell': 'cancel',
  'contac': 'contact',
  'contct': 'contact',
  'conatct': 'contact',
  'suport': 'support',
  'supprt': 'support',
  'supoort': 'support',
  'organisr': 'organizer',
  'organiser': 'organizer',
  'organizr': 'organizer',
  'privcay': 'privacy',
  'privcy': 'privacy',
  'pivacy': 'privacy',
  'plicy': 'policy',
  'poilcy': 'policy',
  'ploicy': 'policy',
  'navigtion': 'navigation',
  'navgation': 'navigation',
  'hompage': 'homepage',
  'homepge': 'homepage',
  'websit': 'website',
  'webiste': 'website',
  'webisite': 'website',
  'paymnt': 'payment',
  'payemnt': 'payment',
  'paymnet': 'payment',
  'scedule': 'schedule',
  'schedlue': 'schedule',
  'walet': 'wallet',
  'walllet': 'wallet',
  'walett': 'wallet',
  'concrt': 'concert',
  'concetr': 'concert',
  'festivl': 'festival',
  'festval': 'festival',
};

/**
 * Apply domain-specific phrase corrections first (multi-word),
 * then word-level corrections.
 */
export function correctTypos(input: string): string {
  let text = input;

  // Phase 1: Multi-word domain corrections (case-insensitive)
  // Sort by length (longest first) to prefer more specific matches
  const sortedDomainCorrections = Object.entries(DOMAIN_CORRECTIONS)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [typo, correction] of sortedDomainCorrections) {
    const lowerText = text.toLowerCase();
    const idx = lowerText.indexOf(typo);
    if (idx !== -1) {
      // Ensure we match at word boundaries to avoid replacing inside other words
      const before = idx > 0 ? lowerText[idx - 1] : ' ';
      const after = idx + typo.length < lowerText.length ? lowerText[idx + typo.length] : ' ';
      const isWordBoundaryBefore = /[\s,.!?;:()"'\-]/.test(before) || idx === 0;
      const isWordBoundaryAfter = /[\s,.!?;:()"'\-]/.test(after) || (idx + typo.length) === lowerText.length;

      if (isWordBoundaryBefore && isWordBoundaryAfter) {
        text = text.substring(0, idx) + correction + text.substring(idx + typo.length);
      }
    }
  }

  // Phase 2: Word-level corrections
  const words = text.split(/(\s+)/); // Keep whitespace
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (/^\s+$/.test(word)) continue; // Skip whitespace tokens

    const stripped = word.replace(/[?.!,;:'"()]+/g, '');
    const lower = stripped.toLowerCase();

    if (WORD_CORRECTIONS[lower]) {
      // Preserve original punctuation
      words[i] = word.replace(stripped, WORD_CORRECTIONS[lower]);
    }
  }

  return words.join('');
}
