import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const client = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiClient = {
  // Tools
  getTools: () => client.get('/tools'),

  // Conversations
  createConversation: (userId?: string) => client.post('/conversations', { userId }),
  getConversation: (id: string) => client.get(`/conversations/${id}`),
  getMessages: (id: string) => client.get(`/conversations/${id}/messages`),
  sendMessage: (conversationId: string, message: string) =>
    client.post(`/conversations/${conversationId}/messages`, { message }),
  getAuditLog: (conversationId: string) => client.get(`/conversations/${conversationId}/audit-log`),

  // Rules
  getRules: (filters?: { toolName?: string; enabled?: boolean }) =>
    client.get('/rules', { params: filters }),
  createRule: (rule: any) => client.post('/rules', rule),
  updateRule: (id: string, updates: any) => client.put(`/rules/${id}`, updates),
  deleteRule: (id: string) => client.delete(`/rules/${id}`),
  toggleRule: (id: string) => client.patch(`/rules/${id}/toggle`),

  // Approvals
  getApprovals: (status?: string) => client.get('/approvals', { params: { status } }),
  approveRequest: (id: string, approvedBy: string) =>
    client.post(`/approvals/${id}/approve`, { approvedBy }),
  rejectRequest: (id: string) => client.post(`/approvals/${id}/reject`),
};
