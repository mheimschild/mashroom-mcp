const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .chat-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-height: 300px;
    max-width: 680px;
    margin: 0 auto;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .msg {
    display: flex;
    flex-direction: column;
    max-width: 88%;
    gap: 4px;
  }

  .msg.user { align-self: flex-end; align-items: flex-end; }
  .msg.assistant { align-self: flex-start; }

  .msg-label {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .msg-bubble {
    padding: 10px 14px;
    border-radius: 2px;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    border: 1px solid;
  }

  .msg.user .msg-bubble {
    border-style: solid;
  }

  .msg.assistant .msg-bubble {
    border-left-width: 2px;
  }

  .chat-input-row {
    display: flex;
    border-top: 1px solid;
  }

  .chat-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    padding: 16px 20px;
    font-family: inherit;
    font-size: 13px;
    resize: none;
    line-height: 1.5;
  }

  .send-btn {
    padding: 0 20px;
    background: none;
    border: none;
    border-left: 1px solid;
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .send-btn:disabled { cursor: default; opacity: 0.3; }
`;

export default styles;
