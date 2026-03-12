<script lang="ts">
  interface Props {
    onclick: () => void;
    isOpen?: boolean;
  }

  let { onclick, isOpen = false }: Props = $props();
</script>

<button
  class="veentbot-bubble-btn"
  class:open={isOpen}
  {onclick}
  aria-label={isOpen ? 'Close chat' : 'Open chat'}
  type="button"
>
  {#if isOpen}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  {:else}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  {/if}
</button>

<style>
  .veentbot-bubble-btn {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--veentbot-primary, #0066cc);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .veentbot-bubble-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  }

  .veentbot-bubble-btn:active {
    transform: scale(0.95);
  }
</style>
