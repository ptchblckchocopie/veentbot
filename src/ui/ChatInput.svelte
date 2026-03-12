<script lang="ts">
  interface Props {
    placeholder?: string;
    disabled?: boolean;
    onSend: (message: string) => void;
  }

  let { placeholder = 'Ask a question...', disabled = false, onSend }: Props = $props();

  let inputValue = $state('');
  let inputEl: HTMLInputElement | undefined = $state();

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!inputValue.trim() || disabled) return;
    onSend(inputValue.trim());
    inputValue = '';
    inputEl?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
  }

  export function focus() {
    inputEl?.focus();
  }

  export function setInput(text: string) {
    inputValue = text;
    inputEl?.focus();
  }
</script>

<form class="veentbot-input-form" onsubmit={handleSubmit}>
  <input
    bind:this={inputEl}
    bind:value={inputValue}
    onkeydown={handleKeydown}
    {placeholder}
    {disabled}
    type="text"
    class="veentbot-input"
    aria-label="Type your message"
    autocomplete="off"
  />
  <button
    class="veentbot-send-btn"
    type="submit"
    disabled={disabled || !inputValue.trim()}
    aria-label="Send message"
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  </button>
</form>

<style>
  .veentbot-input-form {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--veentbot-border, #e0e0e0);
    background: var(--veentbot-bg, #ffffff);
    border-radius: 0 0 16px 16px;
  }

  .veentbot-input {
    flex: 1;
    border: 1px solid var(--veentbot-border, #e0e0e0);
    border-radius: 20px;
    padding: 8px 16px;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    color: var(--veentbot-text, #1a1a1a);
    background: var(--veentbot-bg, #ffffff);
    transition: border-color 0.15s;
  }

  .veentbot-input:focus {
    border-color: var(--veentbot-primary, #0066cc);
  }

  .veentbot-input::placeholder {
    color: var(--veentbot-text-muted, #999);
  }

  .veentbot-send-btn {
    background: var(--veentbot-primary, #0066cc);
    color: white;
    border: none;
    border-radius: 50%;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: opacity 0.15s;
    flex-shrink: 0;
  }

  .veentbot-send-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .veentbot-send-btn:hover:not(:disabled) {
    opacity: 0.85;
  }
</style>
