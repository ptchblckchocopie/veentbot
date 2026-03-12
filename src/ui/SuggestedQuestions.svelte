<script lang="ts">
  interface Props {
    questions: string[];
    onSelect: (question: string) => void;
  }

  let { questions, onSelect }: Props = $props();
</script>

{#if questions.length > 0}
  <div class="veentbot-suggestions">
    {#each questions as question}
      <button
        class="veentbot-chip"
        onclick={() => onSelect(question)}
        type="button"
      >
        {question}
      </button>
    {/each}
  </div>
{/if}

<style>
  .veentbot-suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 0;
  }

  .veentbot-chip {
    background: var(--veentbot-bg-secondary, #f0f0f0);
    color: var(--veentbot-primary, #0066cc);
    border: 1px solid var(--veentbot-border, #e0e0e0);
    border-radius: 16px;
    padding: 6px 14px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    font-family: inherit;
    line-height: 1.3;
    text-align: left;
  }

  .veentbot-chip:hover {
    background: var(--veentbot-primary, #0066cc);
    color: white;
    border-color: var(--veentbot-primary, #0066cc);
  }
</style>
