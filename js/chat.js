function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  appendMessage('user', msg);

  setTimeout(() => {
    const response = AI_RESPONSES[aiResponseIndex % AI_RESPONSES.length];
    aiResponseIndex++;
    appendMessage('ai', response);
  }, 900);
}

function sendQuickPrompt(text) {
  document.getElementById('chat-input').value = text;
  sendChat();
  document.getElementById('chat').scrollIntoView({ behavior: 'smooth' });
}

function appendMessage(type, text) {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `message ${type}`;
  div.innerHTML = `
    <div class="msg-icon">${type === 'ai' ? '🤖' : '👤'}</div>
    <div class="msg-bubble">${text}</div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}
