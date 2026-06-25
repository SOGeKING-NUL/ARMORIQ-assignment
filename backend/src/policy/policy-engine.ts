import { sql } from '../db/client.js';
import { Guardrail, PolicyDecision, PolicyCondition } from '../db/types.js';
import { conversationStore } from '../db/conversation-store.js';

export class PolicyEngine {
  private ruleCache: Map<string, Guardrail[]> = new Map();

  async initialize(): Promise<void> {
    await this.refreshRules();
  }

  async refreshRules(): Promise<void> {
    try {
      const rules = await sql<Guardrail[]>`
        SELECT * FROM guardrails
        WHERE enabled = true
        ORDER BY priority ASC
      `;

      this.ruleCache.clear();
      for (const rule of rules) {
        const key = rule.tool_name;
        if (!this.ruleCache.has(key)) {
          this.ruleCache.set(key, []);
        }
        this.ruleCache.get(key)!.push(rule);
      }

      console.log('[Policy] Rules refreshed:', this.ruleCache.size, 'tool groups');
    } catch (error) {
      console.error('[Policy] Failed to refresh rules:', error);
      throw error;
    }
  }

  async evaluate(
    toolName: string,
    toolInput: Record<string, unknown>,
    userId?: string,
    conversationId?: string
  ): Promise<PolicyDecision> {
    const rules = this.ruleCache.get(toolName) || [];
    const wildcardRules = this.ruleCache.get('*') || [];
    const applicableRules = [...rules, ...wildcardRules];

    if (applicableRules.length === 0) {
      return {
        allowed: true,
        reason: 'No guardrails defined for this tool',
        requiresApproval: false,
      };
    }

    for (const rule of applicableRules) {
      if (rule.type === 'BLOCK') {
        return {
          allowed: false,
          reason: `Tool is blocked by rule: ${rule.name}`,
          requiresApproval: false,
        };
      }

      if (rule.type === 'VALIDATE') {
        if (rule.input_pattern) {
          try {
            const pattern = new RegExp(rule.input_pattern);
            const inputStr = JSON.stringify(toolInput);
            if (!pattern.test(inputStr)) {
              return {
                allowed: false,
                reason: `Input validation failed: ${rule.name}`,
                requiresApproval: false,
              };
            }
          } catch (error) {
            console.warn('[Policy] Invalid regex pattern:', rule.input_pattern);
          }
        }

        if (rule.conditions && Array.isArray(rule.conditions) && rule.conditions.length > 0) {
          for (const condition of rule.conditions) {
            const fieldValue = toolInput[condition.field];
            if (fieldValue === undefined || fieldValue === null) continue;

            let conditionMet = false;
            switch (condition.op) {
              case 'lt': conditionMet = fieldValue < condition.value; break;
              case 'gt': conditionMet = fieldValue > condition.value; break;
              case 'eq': conditionMet = fieldValue === condition.value; break;
              case 'lte': conditionMet = fieldValue <= condition.value; break;
              case 'gte': conditionMet = fieldValue >= condition.value; break;
              case 'ne': conditionMet = fieldValue !== condition.value; break;
            }

            if (!conditionMet) {
              return {
                allowed: false,
                reason: condition.message || `Policy condition failed: ${condition.field} ${condition.op} ${condition.value}`,
                requiresApproval: false,
              };
            }
          }
        }
      }

      if (rule.type === 'REQUIRE_APPROVAL') {
        let conditionMatches = true;

        if (rule.input_pattern) {
          try {
            const pattern = new RegExp(rule.input_pattern);
            const inputStr = JSON.stringify(toolInput);
            conditionMatches = pattern.test(inputStr);
          } catch (error) {
            console.warn('[Policy] Invalid regex pattern:', rule.input_pattern);
          }
        }

        if (conditionMatches && rule.conditions && Array.isArray(rule.conditions) && rule.conditions.length > 0) {
          for (const condition of rule.conditions) {
            const fieldValue = toolInput[condition.field];
            if (fieldValue === undefined || fieldValue === null) {
              conditionMatches = false;
              break;
            }

            let conditionMet = false;
            switch (condition.op) {
              case 'lt': conditionMet = fieldValue < condition.value; break;
              case 'gt': conditionMet = fieldValue > condition.value; break;
              case 'eq': conditionMet = fieldValue === condition.value; break;
              case 'lte': conditionMet = fieldValue <= condition.value; break;
              case 'gte': conditionMet = fieldValue >= condition.value; break;
              case 'ne': conditionMet = fieldValue !== condition.value; break;
            }

            if (!conditionMet) {
              conditionMatches = false;
              break;
            }
          }
        }

        if (conditionMatches) {
          if (conversationId) {
            const hasBeenApproved = await this.checkIfApproved(conversationId, toolName, toolInput);
            if (hasBeenApproved) {
              continue;
            }
          }

          return {
            allowed: true,
            reason: `Tool requires approval: ${rule.name}`,
            requiresApproval: true,
          };
        }
      }

      if (rule.type === 'BUDGET' && rule.cost_budget_tokens) {
        if (conversationId) {
          const conversation = await conversationStore.getConversation(conversationId);
          if (conversation && conversation.token_count >= rule.cost_budget_tokens) {
            return {
              allowed: false,
              reason: `Budget exceeded: ${conversation.token_count} >= ${rule.cost_budget_tokens}`,
              requiresApproval: false,
              costEstimate: rule.cost_budget_tokens,
            };
          }
        }
        return {
          allowed: true,
          reason: `Tool has cost budget: ${rule.name}`,
          requiresApproval: false,
          costEstimate: rule.cost_budget_tokens,
        };
      }
    }

    return {
      allowed: true,
      reason: 'No blocking rules applied',
      requiresApproval: false,
    };
  }

  getToolRules(toolName: string): Guardrail[] {
    return this.ruleCache.get(toolName) || [];
  }

  getAllRules(): Guardrail[] {
    const allRules: Guardrail[] = [];
    this.ruleCache.forEach((rules) => allRules.push(...rules));
    return allRules.sort((a, b) => a.priority - b.priority);
  }

  private async checkIfApproved(
    conversationId: string,
    toolName: string,
    toolInput: Record<string, any>
  ): Promise<boolean> {
    try {
      const sortKeys = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) return obj;
        if (Array.isArray(obj)) return obj.map(sortKeys);
        const sorted: any = {};
        Object.keys(obj).sort().forEach(k => {
          sorted[k] = sortKeys(obj[k]);
        });
        return sorted;
      };

      const inputStr = JSON.stringify(sortKeys(toolInput));
      console.log(`[PolicyEngine] checkIfApproved - toolName: ${toolName}, conversationId: ${conversationId}`);
      console.log(`[PolicyEngine] checkIfApproved - Current inputStr:`, inputStr);

      const approvals = await sql`
        SELECT * FROM pending_approvals
        WHERE conversation_id = ${conversationId}
          AND tool_name = ${toolName}
          AND status = 'approved'
        ORDER BY approved_at DESC
        LIMIT 1
      `;
      if (approvals && approvals.length > 0) {
        const approval = approvals[0];
        let dbToolInput = approval.tool_input;
        if (typeof dbToolInput === 'string') {
          try {
            dbToolInput = JSON.parse(dbToolInput);
          } catch (e) {
            // ignore
          }
        }
        const dbInputStr = JSON.stringify(sortKeys(dbToolInput));
        console.log(`[PolicyEngine] checkIfApproved - Found approval record. dbInputStr:`, dbInputStr);
        const isMatch = inputStr === dbInputStr;
        console.log(`[PolicyEngine] checkIfApproved - Match Result:`, isMatch);
        return isMatch;
      }
      console.log(`[PolicyEngine] checkIfApproved - No approved records found for this conversation & tool.`);
      return false;
    } catch (error) {
      console.error('[Policy] Failed to check approval status:', error);
      return false;
    }
  }
}

export const policyEngine = new PolicyEngine();
