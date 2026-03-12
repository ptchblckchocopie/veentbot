<div class="veentbot-typing">
  <span class="veentbot-dot"></span>
  <span class="veentbot-dot"></span>
  <span class="veentbot-dot"></span>
</div>

<style>
  .veentbot-typing {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 12px 16px;
  }

  .veentbot-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--veentbot-text-muted, #999);
    animation: veentbot-bounce 1.4s infinite ease-in-out both;
  }

  .veentbot-dot:nth-child(1) { animation-delay: -0.32s; }
  .veentbot-dot:nth-child(2) { animation-delay: -0.16s; }

  @keyframes veentbot-bounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }
</style>
