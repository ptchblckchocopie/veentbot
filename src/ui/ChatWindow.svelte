<script lang="ts">
  import type { ChatMessage } from './stores.js';
  import MessageList from './MessageList.svelte';
  import ChatInput from './ChatInput.svelte';
  import SuggestedQuestions from './SuggestedQuestions.svelte';

  interface Props {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
    companyName?: string;
    greeting?: string;
    suggestedQuestions?: string[];
    placeholder?: string;
    onSend: (message: string) => void;
    onFeedback: (messageId: string, rating: 'positive' | 'negative') => void;
    onClose: () => void;
  }

  let {
    messages,
    isLoading,
    error,
    companyName = 'Support',
    greeting = 'Hi! How can I help you today?',
    suggestedQuestions = [],
    placeholder = 'Ask a question...',
    onSend,
    onFeedback,
    onClose,
  }: Props = $props();

  let chatInputRef: ChatInput | undefined = $state();

  const showWelcome = $derived(messages.length === 0);

  function handleSuggestedSelect(question: string) {
    onSend(question);
  }
</script>

<div class="veentbot-window" role="dialog" aria-label="Chat with {companyName}">
  <!-- Header -->
  <div class="veentbot-header">
    <div class="veentbot-header-info">
      <span class="veentbot-header-title">{companyName}</span>
      <span class="veentbot-header-subtitle">Ask us anything</span>
    </div>
    <button class="veentbot-close-btn" onclick={onClose} aria-label="Close chat" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>

  <!-- Messages area -->
  <div class="veentbot-body">
    {#if showWelcome}
      <div class="veentbot-welcome">
        <p class="veentbot-greeting">{greeting}</p>
        {#if suggestedQuestions.length > 0}
          <SuggestedQuestions questions={suggestedQuestions} onSelect={handleSuggestedSelect} />
        {/if}
      </div>
    {:else}
      <MessageList
        {messages}
        {isLoading}
        {onFeedback}
        onSuggestedSelect={handleSuggestedSelect}
      />
    {/if}

    {#if error}
      <div class="veentbot-error" role="alert">{error}</div>
    {/if}
  </div>

  <!-- Input -->
  <ChatInput
    bind:this={chatInputRef}
    {placeholder}
    disabled={isLoading}
    onSend={onSend}
  />
</div>

<style>
  .veentbot-window {
    display: flex;
    flex-direction: column;
    width: 380px;
    height: 560px;
    background: var(--veentbot-bg, #ffffff);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .veentbot-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: var(--veentbot-primary, #0066cc);
    color: white;
  }

  .veentbot-header-info {
    display: flex;
    flex-direction: column;
  }

  .veentbot-header-title {
    font-weight: 600;
    font-size: 16px;
  }

  .veentbot-header-subtitle {
    font-size: 12px;
    opacity: 0.85;
  }

  .veentbot-close-btn {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: background 0.15s;
  }

  .veentbot-close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .veentbot-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .veentbot-welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 24px 20px;
    text-align: center;
  }

  .veentbot-greeting {
    font-size: 16px;
    color: var(--veentbot-text, #1a1a1a);
    margin: 0 0 16px;
    line-height: 1.4;
  }

  .veentbot-error {
    padding: 8px 16px;
    margin: 0 12px 8px;
    background: #fef2f2;
    color: #dc2626;
    border-radius: 8px;
    font-size: 13px;
    text-align: center;
  }

  /* Mobile: full screen */
  @media (max-width: 480px) {
    .veentbot-window {
      width: 100vw;
      height: 100vh;
      border-radius: 0;
      position: fixed;
      top: 0;
      left: 0;
    }
  }
</style>
