export interface PolicyCondition {
  field: string;
  op: 'lt' | 'gt' | 'eq' | 'lte' | 'gte' | 'ne';
  value: any;
  message?: string;
}

export interface Guardrail {
  id: string;
  name: string;
  description?: string;
  priority: number;
  type: 'BLOCK' | 'REQUIRE_APPROVAL' | 'VALIDATE' | 'BUDGET';
  tool_name: string;
  input_pattern?: string;
  conditions?: PolicyCondition[];
  blocked: boolean;
  requires_approval: boolean;
  cost_budget_tokens?: number;
  enabled: boolean;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sequence_num: number;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: any[];
  tool_call_id?: string;
  created_at: Date;
}

export interface Conversation {
  id: string;
  user_id?: string;
  start_at: Date;
  status: 'active' | 'completed' | 'paused';
  token_count: number;
  cost_estimate: number;
  created_at: Date;
}

export interface AuditLogEntry {
  id: string;
  conversation_id: string;
  timestamp: Date;
  tool_name: string;
  tool_input: any;
  policy_decision: 'ALLOWED' | 'BLOCKED' | 'REQUIRES_APPROVAL';
  policy_reason?: string;
  execution_result?: any;
  agent_next_move?: string;
  created_at: Date;
}

export interface PendingApproval {
  id: string;
  conversation_id: string;
  tool_name: string;
  tool_input: any;
  requested_at: Date;
  approved_by?: string;
  approved_at?: Date;
  status: 'pending' | 'approved' | 'rejected';
  created_at: Date;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
  costEstimate?: number;
}
