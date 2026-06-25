import { useState } from 'react';
import { apiClient } from '../api/client';
import { useWebSocket, WebSocketMessage } from '../hooks/useWebSocket';
import '../styles/ConversationView.css';

interface ConversationViewProps {
  conversationId: string;
}

export default function ConversationView({ conversationId }: ConversationViewProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

  useWebSocket((msg: WebSocketMessage) => {
    if (msg.type === 'CONVERSATION_UPDATE' && msg.data.conversationId === conversationId) {
      setMessages(prev => [
        ...prev,
        {
          type: 'assistant',
          content: msg.data.finalResponse,
          toolCalls: msg.data.toolCalls,
        }
      ]);
    }
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    setLoading(true);
    try {
      const response = await apiClient.sendMessage(conversationId, inputValue);
      setMessages([
        ...messages,
        {
          type: 'user',
          content: inputValue,
        },
        {
          type: 'assistant',
          content: response.data.finalResponse,
          toolCalls: response.data.toolCalls,
        },
      ]);
      setInputValue('');
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="conversation-view">
      <div className="conversation-header">
        <h2>Conversation {conversationId}</h2>
      </div>

      <div className="message-list">
        {messages.length === 0 ? (
          <p className="empty-state">Start a conversation by sending a message.</p>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.type}`}>
              <p>{msg.content}</p>
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="tool-calls">
                  <p className="tools-label">Tools Called:</p>
                  {msg.toolCalls.map((call: any, i: number) => (
                    <div key={i} className="tool-call">
                      <span className={`decision ${call.policyDecision.toLowerCase()}`}>
                        {call.policyDecision}
                      </span>
                      <span>{call.toolName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSendMessage} className="message-input">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type your message..."
          disabled={loading}
        />
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
