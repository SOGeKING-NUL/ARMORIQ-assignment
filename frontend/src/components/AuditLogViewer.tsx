import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import '../styles/AuditLogViewer.css';

interface AuditLogViewerProps {
  conversationId: string;
}

export default function AuditLogViewer({ conversationId }: AuditLogViewerProps) {
  const [log, setLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadAuditLog();
  }, [conversationId]);

  const loadAuditLog = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getAuditLog(conversationId);
      setLog(response.data.log);
    } catch (error) {
      console.error('Failed to load audit log:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="audit-log-viewer">
      <div className="log-header">
        <h2>Audit Log</h2>
        <button onClick={loadAuditLog} className="btn-secondary">
          Refresh
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : log.length === 0 ? (
        <p className="empty-state">No tool calls yet.</p>
      ) : (
        <div className="log-table">
          <div className="log-header-row">
            <div className="col-time">Time</div>
            <div className="col-tool">Tool</div>
            <div className="col-decision">Decision</div>
            <div className="col-actions">Details</div>
          </div>
          {log.map((entry) => (
            <div key={entry.id} className="log-row">
              <div className="col-time">{new Date(entry.timestamp).toLocaleTimeString()}</div>
              <div className="col-tool">{entry.tool_name}</div>
              <div className={`col-decision ${entry.policy_decision.toLowerCase()}`}>
                {entry.policy_decision}
              </div>
              <div className="col-actions">
                <button
                  onClick={() =>
                    setExpandedId(expandedId === entry.id ? null : entry.id)
                  }
                  className="btn-small"
                >
                  {expandedId === entry.id ? '▼' : '▶'}
                </button>
              </div>
              {expandedId === entry.id && (
                <div className="log-details">
                  <div className="detail-section">
                    <h4>Input</h4>
                    <pre>{JSON.stringify(entry.tool_input, null, 2)}</pre>
                  </div>
                  <div className="detail-section">
                    <h4>Reason</h4>
                    <p>{entry.policy_reason}</p>
                  </div>
                  {entry.execution_result && (
                    <div className="detail-section">
                      <h4>Result</h4>
                      <pre>{JSON.stringify(entry.execution_result, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
