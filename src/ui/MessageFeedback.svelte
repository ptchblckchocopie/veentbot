<script lang="ts">
  interface Props {
    messageId: string;
    feedbackGiven?: 'positive' | 'negative';
    onFeedback: (messageId: string, rating: 'positive' | 'negative') => void;
  }

  let { messageId, feedbackGiven, onFeedback }: Props = $props();
</script>

<div class="veentbot-feedback">
  <button
    class="veentbot-feedback-btn"
    class:active={feedbackGiven === 'positive'}
    disabled={!!feedbackGiven}
    onclick={() => onFeedback(messageId, 'positive')}
    type="button"
    aria-label="Helpful"
    title="Helpful"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
    </svg>
  </button>
  <button
    class="veentbot-feedback-btn"
    class:active={feedbackGiven === 'negative'}
    disabled={!!feedbackGiven}
    onclick={() => onFeedback(messageId, 'negative')}
    type="button"
    aria-label="Not helpful"
    title="Not helpful"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
    </svg>
  </button>
</div>

<style>
  .veentbot-feedback {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }

  .veentbot-feedback-btn {
    background: none;
    border: none;
    color: var(--veentbot-text-muted, #999);
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
    display: flex;
    align-items: center;
  }

  .veentbot-feedback-btn:hover:not(:disabled) {
    color: var(--veentbot-primary, #0066cc);
    background: var(--veentbot-bg-secondary, #f0f0f0);
  }

  .veentbot-feedback-btn.active {
    color: var(--veentbot-primary, #0066cc);
  }

  .veentbot-feedback-btn:disabled {
    cursor: default;
    opacity: 0.5;
  }
</style>
