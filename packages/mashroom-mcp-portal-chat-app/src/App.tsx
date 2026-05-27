import { type KeyboardEventHandler, useEffect, useRef, useState } from 'react';
import './App.css';
import styles from './styles';

const MAX_HISTORY = 20;

type Message = {
  content: string;
  streaming?: boolean;
  role: string;
};

const App = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    const userMsg: Message = { role: 'user', content: text };
    const assistantMsg: Message = {
      role: 'assistant',
      content: '',
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    try {
      // Build history: last N non-streaming messages + the new user message
      const history = [...messages.filter((m) => !m.streaming), userMsg].slice(
        -MAX_HISTORY,
      );

      const res = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      while (reader && true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + chunk,
          };
          return updated;
        });
      }
    } catch (err) {
      err instanceof Error &&
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: `[error: ${err.message}]`,
          };
          return updated;
        });
    } finally {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          streaming: false,
        };
        return updated;
      });
      setStreaming(false);
    }
  }

  const onKeyDown: KeyboardEventHandler = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="chat-root">
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.role + msg.content} className={`msg ${msg.role}`}>
              <span className="msg-label">{msg.role}</span>
              <div className={`msg-bubble ${msg.streaming ? 'streaming' : ''}`}>
                {msg.content}
                {msg.streaming && '▍'}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-row">
          <textarea
            className="chat-input"
            rows={1}
            placeholder="type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={streaming}
          />
          <button
            type="button"
            className="send-btn"
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
          >
            send
          </button>
        </div>
      </div>
    </>
  );
};

export default App;
