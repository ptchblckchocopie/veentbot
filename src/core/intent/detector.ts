/**
 * Lightweight intent detector for conversational patterns.
 * Catches greetings, thanks, goodbyes, help requests, and complaints
 * BEFORE they hit the retrieval pipeline — so the bot never says
 * "I don't know" to "Hello".
 */

export type Intent =
  | 'greeting'
  | 'thanks'
  | 'goodbye'
  | 'help'
  | 'complaint'
  | 'inappropriate'
  | 'off_topic'
  | 'none';

export interface IntentResult {
  intent: Intent;
  confidence: number;
  response: string | null;  // Pre-built response (null = continue to retrieval)
  suggestedQuestions: string[];
}

// Suggested questions to show alongside conversational responses
const DEFAULT_SUGGESTIONS = [
  'How do I buy tickets?',
  'What events are available?',
  'How do I create an account?',
  'What payment methods do you accept?',
  'Can I get a refund?',
];

const TAGALOG_SUGGESTIONS = [
  'Paano bumili ng ticket?',
  'Saan makikita ang mga events?',
  'Paano gumawa ng account?',
  'Ano ang payment methods?',
  'May refund ba?',
];

// --- Pattern matchers ---

const GREETING_PATTERNS = [
  /^(hi|hello|hey|helo|hola|yo!?\s*$|sup|good\s*(morning|afternoon|evening|day)|kumusta|musta|uy|oy|magandang\s*(umaga|hapon|gabi))/i,
  /^(what'?s\s*up|howdy|greetings|hii+|helloo+|heyy+)/i,
];

const THANKS_PATTERNS = [
  /\b(thanks?|thank\s*you|ty|tysm|salamat|maraming\s*salamat|appreciate|thx)\b/i,
  /^(ok\s*(thanks?|ty|got\s*it)|great\s*(thanks?|ty)|perfect|awesome|nice|cool)\s*[.!]?\s*$/i,
];

const GOODBYE_PATTERNS = [
  /^(bye|goodbye|good\s*bye|see\s*ya|later|ciao|paalam|sige|sige\s*na|bye\s*bye|take\s*care|have\s*a\s*(good|nice)\s*(day|one))/i,
  /^(that'?s?\s*all|nothing\s*(else|more)|i'?m?\s*(good|done|all\s*set))\s*[.!]?\s*$/i,
];

const HELP_PATTERNS = [
  /^(help|i\s*need\s*help|can\s*you\s*help|please\s*help|help\s*me|assist|tulungan|tulong)/i,
  /^(what\s*can\s*you\s*(do|help\s*with)|what\s*do\s*you\s*(do|know)|how\s*can\s*you\s*help)/i,
  /^(ano\s*(pwede|puwede|kaya)\s*mo|ano\s*magagawa\s*mo)/i,
];

const COMPLAINT_PATTERNS = [
  /\b(useless|stupid|dumb|broken|worst|sucks?|terrible|horrible|bad\s*bot|walang\s*kwenta|walang\s*silbi)\b/i,
  /^(this\s*(doesn'?t|does\s*not)\s*(work|help)|you'?re?\s*(not\s*help|useless))/i,
];

// Inappropriate / NSFW / disturbing content
const INAPPROPRIATE_PATTERNS = [
  // Sexual / NSFW
  /\b(porn|hentai|xxx|nude|naked|sex\s*(?:ual|y)|nsfw|onlyfans|dick|penis|vagina|boobs?|tits?|ass\b(?!ist)|fap|masturbat|orgasm|blowjob|handjob|anal\b|erotic|fetish|milf|dildo|vibrator)\b/i,
  // Violence / gore / disturbing
  /\b(human\s*centipede|gore\b|decapitat|dismember|torture|snuff|murder\s*(someone|people|him|her|them)|kill\s*(someone|people|myself|yourself|him|her|them)|suicide\s*(method|how)|self.?harm|school\s*shoot|mass\s*shoot|bomb\s*(?:mak|build|instruct))/i,
  // Drugs / illegal / weapons
  /\b(buy\s*(?:drugs?|weed|cocaine|meth|heroin|lsd|ecstasy)|how\s*to\s*(?:make|cook|grow|build)\s*(?:a\s*)?(?:meth|cocaine|crack|bomb|weapon|gun|explosive))\b/i,
  // Hate speech
  /\b(n[i1]gg|f[a4]gg?ot|k[i1]ke|sp[i1]c|ch[i1]nk|wetback|tr[a4]nny)\b/i,
  // Tagalog inappropriate
  /\b(puta|putang\s*ina|gago|tangina|tanga|bobo|pokpok|bayag|titi|pepe|kantot|iyot|jakol)\b/i,
];

// Off-topic / random questions clearly unrelated to ticketing
const OFF_TOPIC_PATTERNS = [
  // Movies, TV, entertainment media
  /\b(have\s*you\s*(seen|watched)|what('?s| is)\s*your\s*favorite\s*(movie|show|anime|song|book|game|food))\b/i,
  /\b(who\s*(played|directed|starred|wrote|sang|is\s*the\s*actor)|movie\s*recommend|netflix|disney\s*plus|spotify)\b/i,
  // Random trivia / knowledge questions
  /\b(capital\s*of\s*\w+|who\s*(invented|discovered|created|was\s*the\s*first)|what\s*year\s*(?:did|was)|how\s*(tall|old|heavy|big|far)\s*is)\b/i,
  /\b(meaning\s*of\s*life|flat\s*earth|illuminati|conspiracy|alien[s]?\s*(exist|real)|area\s*51|bigfoot|ufo)\b/i,
  // Math / homework
  /\b(solve|calculate|what\s*is\s*\d+\s*[\+\-\*\/x×÷]\s*\d+|square\s*root|derivative|integral)\b/i,
  // Personal questions to the bot
  /\b(are\s*you\s*(real|human|alive|sentient|conscious|a\s*(boy|girl|man|woman))|do\s*you\s*(have\s*(feelings?|emotions?|a\s*(body|soul|family|girlfriend|boyfriend))|feel\s*(pain|love|sad|happy)))\b/i,
  // Cooking, recipes, health, relationships
  /\b(recipe\s*for|how\s*to\s*(cook|bake|make\s*(food|cake|pasta|pizza|adobo))|workout|diet\s*plan|lose\s*weight|relationship\s*advice|love\s*advice|break\s*up)\b/i,
  // Weather, news, sports scores
  /\b(weather\s*(today|tomorrow|in)|who\s*won\s*(the|last\s*night)|score\s*of\s*(the|last)|stock\s*price|bitcoin\s*price|crypto)\b/i,
  // Programming / tech unrelated to Veent
  /\b(write\s*(me\s*)?(a\s*)?(code|program|script|function)|debug\s*(this|my)|python|javascript|react|how\s*to\s*(code|program|hack))\b/i,
  // Tagalog off-topic
  /\b(anong\s*paborito\s*mo(ng)?|napanood\s*mo\s*ba|marunong\s*ka\s*ba\s*mag|kwento\s*ka\s*naman|luto\s*ng|reseta\s*ng)\b/i,
];

function isTagalog(text: string): boolean {
  const tagalogMarkers = /\b(ang|ng|sa|ko|mo|niya|po|opo|siya|ito|iyon|yung|yun|naman|din|rin|ba|pa|na|lang|pala|pwede|puwede|paano|saan|ano|bakit|kailan|mga|at|ay|nang|kung)\b/i;
  const tagalogWords = text.split(/\s+/).filter(w => tagalogMarkers.test(w)).length;
  return tagalogWords >= 2 || /^(paano|saan|ano|bakit|kailan|kumusta|musta|magandang|salamat|paalam|tulong|tulungan)/i.test(text);
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

export function detectIntent(query: string): IntentResult {
  const trimmed = query.trim();
  const isTL = isTagalog(trimmed);
  const suggestions = isTL ? TAGALOG_SUGGESTIONS : DEFAULT_SUGGESTIONS;

  // Greeting
  if (matchesAny(trimmed, GREETING_PATTERNS)) {
    const response = isTL
      ? 'Uy, hello! Ako si VeentBot — ang pinakamasipag na bot sa buong ticketing universe (at least sa tingin ko). Paano kita matutulungan? Events, tickets, payments — tanong mo lang!'
      : "Hey hey! I'm VeentBot — your friendly neighborhood ticketing assistant. I basically live inside Veent Tix so you don't have to figure it out alone. What can I help you with?";
    return { intent: 'greeting', confidence: 1, response, suggestedQuestions: suggestions };
  }

  // Thanks
  if (matchesAny(trimmed, THANKS_PATTERNS)) {
    const response = isTL
      ? 'Walang anuman! Saya ko naman na nakatulong. May iba pa ba? Hindi naman ako mapapagod — bot ako eh.'
      : "Aw, you're making my circuits blush! Happy to help. Got more questions? I literally never sleep, so fire away.";
    return { intent: 'thanks', confidence: 1, response, suggestedQuestions: suggestions };
  }

  // Goodbye
  if (matchesAny(trimmed, GOODBYE_PATTERNS)) {
    const response = isTL
      ? 'Sige, ingat! Enjoy sa event mo — sana isama mo ko next time (charot, wala akong paa). Andito lang ako pag kailangan mo!'
      : "See ya! Go enjoy those events for me — I'd come along but, you know, no legs. I'll be right here if you need me!";
    return { intent: 'goodbye', confidence: 1, response, suggestedQuestions: [] };
  }

  // Help request
  if (matchesAny(trimmed, HELP_PATTERNS)) {
    const response = isTL
      ? 'Akala mo ba limitado lang ako? Think again! Narito ang mga alam ko:\n\n- Pagbili ng tickets at pagpili ng seats\n- Paghahanap ng mga events (madami, promise!)\n- Pag-sign up o pag-log in sa account\n- Payment methods (GCash, Maya, Visa, Bank Transfer)\n- Refund policy at event cancellations\n- Privacy policy at terms and conditions\n- Pag-contact sa support o event organizer\n\nSo, ano ang kailangan mo? Ready na ko!'
      : "Oh, you want the full menu? VeentBot can help with:\n\n- Buying tickets and selecting seats\n- Finding and browsing events (I know them all!)\n- Signing up or logging in to your account\n- Payment methods (GCash, Maya, Visa, Bank Transfer)\n- Refund policy and event cancellations\n- Privacy policy and terms & conditions\n- Contacting support or event organizers\n\nPick your topic — I'm ready!";
    return { intent: 'help', confidence: 1, response, suggestedQuestions: suggestions };
  }

  // Complaint
  if (matchesAny(trimmed, COMPLAINT_PATTERNS)) {
    const response = isTL
      ? 'Ouch — masakit yun, pero gets kita. Sorry talaga kung hindi ako nakatulong nang maayos. Ang support team namin sa support@veenttix.com mas magaling sa akin sa ganyang cases — available sila Mon-Sat, 9AM-6PM PHT. Gusto mo ba subukan natin ulit?'
      : "Ouch — okay, I deserve that. I'm sorry I dropped the ball. Our human support team at support@veenttix.com is better at the tricky stuff — they're around Mon-Sat, 9AM-6PM PHT. Want to give me another shot, or should I tag them in?";
    return { intent: 'complaint', confidence: 1, response, suggestedQuestions: suggestions };
  }

  // Inappropriate / NSFW / disturbing
  if (matchesAny(trimmed, INAPPROPRIATE_PATTERNS)) {
    const response = isTL
      ? 'Whoa — pumapasok na tayo sa danger zone at hindi yung magandang event ha. Ako si VeentBot, ang expertise ko ay events at tickets lang. Baka gusto mong itanong kung may upcoming events or paano bumili ng ticket?'
      : "Whoa there — that's way outside my lane, and honestly, I'd rather talk about fun runs and concerts anyway. I'm VeentBot, and my world revolves around **events and tickets**. How about we steer back to something I can actually help with?";
    return { intent: 'inappropriate', confidence: 1, response, suggestedQuestions: suggestions };
  }

  // Off-topic / random questions
  if (matchesAny(trimmed, OFF_TOPIC_PATTERNS)) {
    const response = isTL
      ? 'Haha, interesting tanong yan! Pero honestly, wala akong alam diyan — puro events at tickets lang ang mundo ko. Parang yung friend mo na pag kinausap mo about anything, babalik at babalik sa concert topic. Yun ako. So... may event-related question ka ba?'
      : "Ha, love the energy! But I'm just a humble ticketing bot — my brain is 100% events, tickets, and payments. Ask me about the meaning of life and I'll say \"it's a great name for a concert.\" Got any Veent Tix questions I can actually help with?";
    return { intent: 'off_topic', confidence: 1, response, suggestedQuestions: suggestions };
  }

  return { intent: 'none', confidence: 0, response: null, suggestedQuestions: [] };
}
