<script lang="ts">
  import type { ChatMessage } from './stores.js';
  import MessageFeedback from './MessageFeedback.svelte';
  import SuggestedQuestions from './SuggestedQuestions.svelte';

  interface Props {
    message: ChatMessage;
    onFeedback: (messageId: string, rating: 'positive' | 'negative') => void;
    onSuggestedSelect: (question: string) => void;
  }

  let { message, onFeedback, onSuggestedSelect }: Props = $props();

  const isUser = $derived(message.role === 'user');
</script>

<div class="veentbot-message" class:user={isUser} class:assistant={!isUser}>
  <div class="veentbot-bubble" class:user={isUser} class:assistant={!isUser}>
    <p class="veentbot-text">{message.content}</p>

    {#if !isUser && message.suggestedQuestions && message.suggestedQuestions.length > 0}
      <SuggestedQuestions
        questions={message.suggestedQuestions}
        onSelect={onSuggestedSelect}
      />
    {/if}

    {#if !isUser}
      <MessageFeedback
        messageId={message.id}
        feedbackGiven={message.feedbackGiven}
        {onFeedback}
      />
    {/if}
  </div>
</div>

<style>
  .veentbot-message {
    display: flex;
    margin-bottom: 8px;
    padding: 0 12px;
  }

  .veentbot-message.user {
    justify-content: flex-end;
  }

  .veentbot-message.assistant {
    justify-content: flex-start;
  }

  .veentbot-bubble {
    max-width: 80%;
    padding: 10px 14px;
    border-radius: 16px;
    word-wrap: break-word;
    line-height: 1.45;
    font-size: 14px;
  }

  .veentbot-bubble.user {
    background: var(--veentbot-primary, #0066cc);
    color: white;
    border-bottom-right-radius: 4px;
  }

  .veentbot-bubble.assistant {
    background: var(--veentbot-bg-secondary, #f0f0f0);
    color: var(--veentbot-text, #1a1a1a);
    border-bottom-left-radius: 4px;
  }

  .veentbot-text {
    margin: 0;
    white-space: pre-wrap;
  }
</style>
