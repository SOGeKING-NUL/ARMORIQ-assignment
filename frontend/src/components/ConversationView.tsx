import { useState, useRef, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useWebSocket, WebSocketMessage } from '../hooks/useWebSocket';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from './Toast';
import '../styles/ConversationView.css';

interface ConversationViewProps {
  conversationId: string;
}

export default function ConversationView({ conversationId }: ConversationViewProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || loading) return;

    const userText = inputValue;
    setInputValue('');
    setLoading(true);

    // Optimistically add user message
    setMessages(prev => [
      ...prev,
      {
        type: 'user',
        content: userText,
      }
    ]);

    try {
      const response = await apiClient.sendMessage(conversationId, userText);
      setMessages(prev => [
        ...prev,
        {
          type: 'assistant',
          content: response.data.finalResponse,
          toolCalls: response.data.toolCalls,
        },
      ]);
    } catch (error) {
      console.error('Failed to send message:', error);
      addToast('Failed to send message. Please check connection.', 'error');
      // Revert optimism on fail or show error msg
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="conversation-view">
      <div className="conversation-header">
        <h2>Conversation ID: {conversationId}</h2>
      </div>

      <div className="message-list">
        {messages.length === 0 ? (
          <p className="empty-state">Start a conversation to see it here.</p>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.type}`}>
              {msg.type === 'user' ? (
                <p>{msg.content}</p>
              ) : (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content || ''}
                  </ReactMarkdown>
                </div>
              )}

              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="tool-calls">
                  {msg.toolCalls.map((call: any, i: number) => (
                    <div key={i} className="tool-call" title={call.policyReason}>
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
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSendMessage} className="message-input">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message AI Assistant..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !inputValue.trim()} className="btn-primary">
          {loading ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
