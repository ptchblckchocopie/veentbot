export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tier?: 'exact' | 'rag' | 'decline';
  confidence?: number;
  suggestedQuestions?: string[];
  timestamp: Date;
  feedbackGiven?: 'positive' | 'negative';
}

export interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
}

export function createChatStore(apiEndpoint: string) {
  let state = $state<ChatState>({
    messages: [],
    sessionId: loadSessionId(),
    isOpen: false,
    isLoading: false,
    error: null,
  });

  // Restore session on load
  if (state.sessionId) {
    restoreSession(state.sessionId);
  }

  async function restoreSession(sessionId: string) {
    try {
      const res = await fetch(`${apiEndpoint}/session?id=${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.messages?.length > 0) {
        state.messages = data.messages.map((m: { id: string; role: string; content: string; created_at: string; tier?: string; similarity_score?: number }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          tier: m.tier,
          confidence: m.similarity_score,
          timestamp: new Date(m.created_at),
        }));
      }
    } catch {
      // Session expired or not found — start fresh
      state.sessionId = null;
      saveSessionId(null);
    }
  }

  async function sendMessage(question: string) {
    if (!question.trim() || state.isLoading) return;

    // Add user message immediately
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question.trim(),
      timestamp: new Date(),
    };
    state.messages = [...state.messages, userMsg];
    state.isLoading = true;
    state.error = null;

    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          sessionId: state.sessionId,
        }),
      });

      if (res.status === 429) {
        state.error = 'Too many messages. Please wait a moment.';
        state.isLoading = false;
        return;
      }

      if (!res.ok) throw new Error('Request failed');

      const data = await res.json();

      state.sessionId = data.sessionId;
      saveSessionId(data.sessionId);

      const botMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer,
        tier: data.tier,
        confidence: data.confidence,
        suggestedQuestions: data.suggestedQuestions,
        timestamp: new Date(),
      };
      state.messages = [...state.messages, botMsg];
    } catch {
      state.error = "I'm having trouble connecting. Please try again.";
    } finally {
      state.isLoading = false;
    }
  }

  async function sendFeedback(messageId: string, rating: 'positive' | 'negative') {
    const msg = state.messages.find(m => m.id === messageId);
    if (!msg || msg.feedbackGiven) return;

    msg.feedbackGiven = rating;
    state.messages = [...state.messages]; // trigger reactivity

    try {
      await fetch(`${apiEndpoint}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          sessionId: state.sessionId,
          rating,
        }),
      });
    } catch {
      // Feedback is fire-and-forget — don't bother the user
    }
  }

  function toggleOpen() {
    state.isOpen = !state.isOpen;
  }

  function clearError() {
    state.error = null;
  }

  return {
    get state() { return state; },
    sendMessage,
    sendFeedback,
    toggleOpen,
    clearError,
  };
}

function loadSessionId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('veentbot-session');
}

function saveSessionId(id: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (id) localStorage.setItem('veentbot-session', id);
  else localStorage.removeItem('veentbot-session');
}
