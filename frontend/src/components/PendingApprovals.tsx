import { useState } from 'react';
import { apiClient } from '../api/client';
import { useToast } from './Toast';
import '../styles/PendingApprovals.css';

interface PendingApprovalsProps {
  onApprovalProcessed: () => void;
  approvals: any[];
  onReload: () => void;
}

export default function PendingApprovals({ approvals, onReload, onApprovalProcessed }: PendingApprovalsProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { addToast } = useToast();

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await apiClient.approveRequest(id, 'Admin');
      addToast('Approval processed. Agent is executing the tool call in the background!', 'success');
      onApprovalProcessed();
      onReload();
    } catch (error) {
      console.error('Failed to approve request:', error);
      addToast('Failed to process approval request.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      await apiClient.rejectRequest(id);
      addToast('Tool call execution rejected.', 'warning');
      onApprovalProcessed();
      onReload();
    } catch (error) {
      console.error('Failed to reject request:', error);
      addToast('Failed to reject request.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="pending-approvals">
      <div className="approvals-header">
        <h2>Pending Approvals Queue</h2>
        <button onClick={onReload} className="btn-secondary btn-small">Refresh</button>
      </div>

      <div className="approvals-list">
        {approvals.length === 0 ? (
          <p className="empty-state">No pending approval requests. Tool executions are running normally.</p>
        ) : (
          approvals.map((app) => (
            <div key={app.id} className="approval-card">
              <div className="approval-card-header">
                <span className="tool-badge">{app.tool_name}</span>
                <span className="timestamp">{new Date(app.requested_at).toLocaleTimeString()}</span>
              </div>
              <div className="approval-details">
                <p><strong>Conversation ID:</strong> <span className="mono">{app.conversation_id}</span></p>
                <div className="payload-box">
                  <strong>Arguments Payload:</strong>
                  <pre>{JSON.stringify(app.tool_input, null, 2)}</pre>
                </div>
              </div>
              <div className="approval-actions">
                <button
                  onClick={() => handleApprove(app.id)}
                  disabled={processingId !== null}
                  className="btn-approve"
                >
                  {processingId === app.id ? 'Processing...' : 'Approve & Execute'}
                </button>
                <button
                  onClick={() => handleReject(app.id)}
                  disabled={processingId !== null}
                  className="btn-reject"
                >
                  Reject Execution
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
