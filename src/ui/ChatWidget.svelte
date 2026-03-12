<script lang="ts">
  import { createChatStore } from './stores.js';
  import ChatBubble from './ChatBubble.svelte';
  import ChatWindow from './ChatWindow.svelte';

  interface Props {
    /** API endpoint for the chat backend (e.g., "/api/chat") */
    apiEndpoint?: string;
    /** Company name shown in the header */
    companyName?: string;
    /** Greeting shown when chat first opens */
    greeting?: string;
    /** Placeholder text in the input field */
    placeholder?: string;
    /** Suggested questions shown on first open */
    suggestedQuestions?: string[];
    /** Position on screen */
    position?: 'bottom-right' | 'bottom-left';
    /** Theme overrides */
    theme?: {
      primary?: string;
      background?: string;
      text?: string;
      textMuted?: string;
      bgSecondary?: string;
      border?: string;
    };
  }

  let {
    apiEndpoint = '/api/chat',
    companyName = 'Support',
    greeting = 'Hi! How can I help you today?',
    placeholder = 'Ask a question...',
    suggestedQuestions = [],
    position = 'bottom-right',
    theme = {},
  }: Props = $props();

  const store = createChatStore(apiEndpoint);

  const cssVars = $derived(
    [
      theme.primary && `--veentbot-primary: ${theme.primary}`,
      theme.background && `--veentbot-bg: ${theme.background}`,
      theme.text && `--veentbot-text: ${theme.text}`,
      theme.textMuted && `--veentbot-text-muted: ${theme.textMuted}`,
      theme.bgSecondary && `--veentbot-bg-secondary: ${theme.bgSecondary}`,
      theme.border && `--veentbot-border: ${theme.border}`,
    ].filter(Boolean).join('; ')
  );

  function handleSend(message: string) {
    store.sendMessage(message);
  }

  function handleFeedback(messageId: string, rating: 'positive' | 'negative') {
    store.sendFeedback(messageId, rating);
  }
</script>

<div
  class="veentbot-container"
  class:bottom-right={position === 'bottom-right'}
  class:bottom-left={position === 'bottom-left'}
  style={cssVars}
>
  {#if store.state.isOpen}
    <div class="veentbot-window-wrapper">
      <ChatWindow
        messages={store.state.messages}
        isLoading={store.state.isLoading}
        error={store.state.error}
        {companyName}
        {greeting}
        {suggestedQuestions}
        {placeholder}
        onSend={handleSend}
        onFeedback={handleFeedback}
        onClose={store.toggleOpen}
      />
    </div>
  {/if}

  <ChatBubble onclick={store.toggleOpen} isOpen={store.state.isOpen} />
</div>

<style>
  .veentbot-container {
    position: fixed;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
  }

  .veentbot-container.bottom-right {
    bottom: 20px;
    right: 20px;
  }

  .veentbot-container.bottom-left {
    bottom: 20px;
    left: 20px;
    align-items: flex-start;
  }

  .veentbot-window-wrapper {
    animation: veentbot-slide-up 0.25s ease-out;
  }

  @keyframes veentbot-slide-up {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Mobile: hide bubble when window is open */
  @media (max-width: 480px) {
    .veentbot-container {
      bottom: 0;
      right: 0;
      left: 0;
    }

    .veentbot-window-wrapper {
      animation: none;
    }
  }
</style>
