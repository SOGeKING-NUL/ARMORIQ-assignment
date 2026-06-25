import { sql } from './client.js';
import { Conversation, AuditLogEntry, PendingApproval, ConversationMessage } from './types.js';

export class ConversationStore {
  async createConversation(userId?: string): Promise<Conversation> {
    const [conversation] = await sql<Conversation[]>`
      INSERT INTO conversations (user_id, status)
      VALUES (${userId ?? null}, 'active')
      RETURNING *
    `;
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const [conversation] = await sql<Conversation[]>`
      SELECT * FROM conversations WHERE id = ${id}
    `;
    return conversation || null;
  }

  async listConversations(filters?: { userId?: string; status?: string }): Promise<Conversation[]> {
    let query = sql<Conversation[]>`SELECT * FROM conversations`;

    if (filters?.userId) {
      query = sql<Conversation[]>`
        SELECT * FROM conversations WHERE user_id = ${filters.userId}
        ORDER BY start_at DESC
      `;
    }

    if (filters?.status) {
      query = sql<Conversation[]>`
        SELECT * FROM conversations WHERE status = ${filters.status}
        ORDER BY start_at DESC
      `;
    }

    return await query;
  }

  async updateConversation(
    id: string,
    updates: Partial<Conversation>
  ): Promise<Conversation | null> {
    const [updated] = await sql<Conversation[]>`
      UPDATE conversations
      SET
        status = COALESCE(${updates.status ?? null}, status),
        token_count = COALESCE(${updates.token_count ?? null}, token_count),
        cost_estimate = COALESCE(${updates.cost_estimate ?? null}, cost_estimate)
      WHERE id = ${id}
      RETURNING *
    `;
    return updated || null;
  }

  async closeConversation(id: string): Promise<Conversation | null> {
    return this.updateConversation(id, { status: 'completed' });
  }

  async appendMessage(
    conversationId: string,
    role: 'system' | 'user' | 'assistant' | 'tool',
    content?: string,
    toolCalls?: any[],
    toolCallId?: string
  ): Promise<ConversationMessage> {
    const [message] = await sql<ConversationMessage[]>`
      INSERT INTO conversation_messages (
        conversation_id, sequence_num, role, content, tool_calls, tool_call_id
      )
      VALUES (
        ${conversationId},
        COALESCE((SELECT MAX(sequence_num) FROM conversation_messages WHERE conversation_id = ${conversationId}), 0) + 1,
        ${role},
        ${content ?? null},
        ${toolCalls ? JSON.stringify(toolCalls) : null},
        ${toolCallId ?? null}
      )
      RETURNING *
    `;
    return message;
  }

  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    return await sql<ConversationMessage[]>`
      SELECT * FROM conversation_messages
      WHERE conversation_id = ${conversationId}
      ORDER BY sequence_num ASC
    `;
  }

  async logToolCall(
    conversationId: string,
    toolName: string,
    toolInput: any,
    decision: 'ALLOWED' | 'BLOCKED' | 'REQUIRES_APPROVAL',
    reason: string,
    result?: any,
    nextMove?: string
  ): Promise<AuditLogEntry> {
    const [entry] = await sql<AuditLogEntry[]>`
      INSERT INTO audit_log (
        conversation_id, tool_name, tool_input, policy_decision,
        policy_reason, execution_result, agent_next_move
      )
      VALUES (${conversationId}, ${toolName}, ${JSON.stringify(toolInput)}, ${decision},
              ${reason}, ${result ? JSON.stringify(result) : null}, ${nextMove ?? null})
      RETURNING *
    `;
    return entry;
  }

  async getAuditLog(conversationId: string): Promise<AuditLogEntry[]> {
    return await sql<AuditLogEntry[]>`
      SELECT * FROM audit_log
      WHERE conversation_id = ${conversationId}
      ORDER BY timestamp ASC
    `;
  }

  async createPendingApproval(
    conversationId: string,
    toolName: string,
    toolInput: any
  ): Promise<PendingApproval> {
    const [approval] = await sql<PendingApproval[]>`
      INSERT INTO pending_approvals (conversation_id, tool_name, tool_input)
      VALUES (${conversationId}, ${toolName}, ${JSON.stringify(toolInput)})
      RETURNING *
    `;
    return approval;
  }

  async getPendingApprovals(filters?: { status?: string }): Promise<PendingApproval[]> {
    let query = sql<PendingApproval[]>`
      SELECT * FROM pending_approvals
      WHERE status = 'pending'
      ORDER BY requested_at ASC
    `;

    if (filters?.status) {
      query = sql<PendingApproval[]>`
        SELECT * FROM pending_approvals
        WHERE status = ${filters.status}
        ORDER BY requested_at ASC
      `;
    }

    return await query;
  }

  async approvePendingApproval(id: string, approvedBy: string): Promise<PendingApproval | null> {
    const [updated] = await sql<PendingApproval[]>`
      UPDATE pending_approvals
      SET status = 'approved', approved_by = ${approvedBy}, approved_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;
    return updated || null;
  }

  async rejectPendingApproval(id: string): Promise<PendingApproval | null> {
    const [updated] = await sql<PendingApproval[]>`
      UPDATE pending_approvals
      SET status = 'rejected'
      WHERE id = ${id}
      RETURNING *
    `;
    return updated || null;
  }
}

export const conversationStore = new ConversationStore();
