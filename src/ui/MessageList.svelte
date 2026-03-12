<script lang="ts">
  import type { ChatMessage } from './stores.js';
  import MessageBubble from './MessageBubble.svelte';
  import TypingIndicator from './TypingIndicator.svelte';

  interface Props {
    messages: ChatMessage[];
    isLoading: boolean;
    onFeedback: (messageId: string, rating: 'positive' | 'negative') => void;
    onSuggestedSelect: (question: string) => void;
  }

  let { messages, isLoading, onFeedback, onSuggestedSelect }: Props = $props();

  let listEl: HTMLDivElement | undefined = $state();

  // Auto-scroll to bottom on new messages
  $effect(() => {
    // Read messages.length to track changes
    messages.length;
    if (listEl) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        listEl!.scrollTop = listEl!.scrollHeight;
      }, 10);
    }
  });
</script>

<div class="veentbot-messages" bind:this={listEl} role="log" aria-live="polite" aria-label="Chat messages">
  {#each messages as message (message.id)}
    <MessageBubble {message} {onFeedback} {onSuggestedSelect} />
  {/each}

  {#if isLoading}
    <div class="veentbot-message assistant">
      <div class="veentbot-bubble assistant">
        <TypingIndicator />
      </div>
    </div>
  {/if}
</div>

<style>
  .veentbot-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px 0;
    scroll-behavior: smooth;
  }

  .veentbot-message {
    display: flex;
    padding: 0 12px;
    margin-bottom: 8px;
  }

  .veentbot-message.assistant {
    justify-content: flex-start;
  }

  .veentbot-bubble.assistant {
    background: var(--veentbot-bg-secondary, #f0f0f0);
    border-radius: 16px;
    border-bottom-left-radius: 4px;
  }
</style>
