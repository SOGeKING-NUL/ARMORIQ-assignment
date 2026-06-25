import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { useWebSocket, WebSocketMessage } from '../hooks/useWebSocket';
import GuardrailBuilder from '../components/GuardrailBuilder';
import ToolCatalog from '../components/ToolCatalog';
import ConversationView from '../components/ConversationView';
import AuditLogViewer from '../components/AuditLogViewer';
import PendingApprovals from '../components/PendingApprovals';
import '../styles/Dashboard.css';

type Tab = 'rules' | 'tools' | 'conversation' | 'logs' | 'approvals';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('rules');
  const [rules, setRules] = useState([]);
  const [tools, setTools] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useWebSocket((message: WebSocketMessage) => {
    if (message.type === 'RULE_UPDATED' || message.type === 'RULE_CREATED' || message.type === 'RULE_DELETED') {
      loadRules();
    }
    if (message.type === 'APPROVAL_REQUEST' || message.type === 'CONVERSATION_UPDATE') {
      loadApprovals();
    }
  });

  useEffect(() => {
    loadRules();
    loadTools();
    loadApprovals();
  }, []);

  const loadRules = async () => {
    try {
      const response = await apiClient.getRules();
      setRules(response.data.rules);
    } catch (error) {
      console.error('Failed to load rules:', error);
    }
  };

  const loadTools = async () => {
    try {
      const response = await apiClient.getTools();
      setTools(response.data.tools);
    } catch (error) {
      console.error('Failed to load tools:', error);
    }
  };

  const loadApprovals = async () => {
    try {
      const response = await apiClient.getApprovals('pending');
      setApprovals(response.data.approvals);
    } catch (error) {
      console.error('Failed to load approvals:', error);
    }
  };

  const startConversation = async () => {
    try {
      const response = await apiClient.createConversation('user123');
      setConversationId(response.data.id);
      setActiveTab('conversation');
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Armoriq - Guardrails Dashboard</h1>
        <button onClick={startConversation} className="btn-primary">
          Start New Conversation
        </button>
      </header>

      <div className="dashboard-nav">
        <button
          className={`nav-btn ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          Guardrails ({rules.length})
        </button>
        <button
          className={`nav-btn ${activeTab === 'tools' ? 'active' : ''}`}
          onClick={() => setActiveTab('tools')}
        >
          Tools ({tools.length})
        </button>
        <button
          className={`nav-btn ${activeTab === 'approvals' ? 'active' : ''}`}
          onClick={() => setActiveTab('approvals')}
        >
          Pending Approvals ({approvals.length})
        </button>
        <button
          className={`nav-btn ${activeTab === 'conversation' ? 'active' : ''}`}
          onClick={() => setActiveTab('conversation')}
          disabled={!conversationId}
        >
          Conversation
        </button>
        <button
          className={`nav-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
          disabled={!conversationId}
        >
          Audit Log
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'rules' && <GuardrailBuilder rules={rules} tools={tools} onRuleCreated={loadRules} />}
        {activeTab === 'tools' && <ToolCatalog tools={tools} />}
        {activeTab === 'approvals' && (
          <PendingApprovals
            approvals={approvals}
            onReload={loadApprovals}
            onApprovalProcessed={loadApprovals}
          />
        )}
        <div style={{ display: activeTab === 'conversation' ? 'block' : 'none' }}>
          {conversationId && <ConversationView conversationId={conversationId} />}
        </div>
        {activeTab === 'logs' && conversationId && <AuditLogViewer conversationId={conversationId} />}
      </div>
    </div>
  );
}
