import { sql } from '../db/client.js';
import { Guardrail } from '../db/types.js';
import { policyEngine } from './policy-engine.js';

export class RuleStore {
  async createRule(rule: Omit<Guardrail, 'id' | 'created_at' | 'updated_at'>): Promise<Guardrail> {
    const [created] = await sql<Guardrail[]>`
      INSERT INTO guardrails (
        name, description, priority, type, tool_name, input_pattern, conditions,
        blocked, requires_approval, cost_budget_tokens, enabled, created_by
      ) VALUES (
        ${rule.name}, ${rule.description ?? null}, ${rule.priority}, ${rule.type},
        ${rule.tool_name}, ${rule.input_pattern ?? null}, ${rule.conditions ? sql.json(rule.conditions as any) : null},
        ${rule.blocked ?? false}, ${rule.requires_approval ?? false}, ${rule.cost_budget_tokens ?? null},
        ${rule.enabled ?? true}, ${rule.created_by ?? null}
      )
      RETURNING *
    `;

    await policyEngine.refreshRules();
    return created;
  }

  async getRuleById(id: string): Promise<Guardrail | null> {
    const [rule] = await sql<Guardrail[]>`
      SELECT * FROM guardrails WHERE id = ${id}
    `;
    return rule || null;
  }

  async listRules(filters?: { toolName?: string; enabled?: boolean }): Promise<Guardrail[]> {
    let query = sql<Guardrail[]>`SELECT * FROM guardrails`;

    if (filters?.toolName) {
      query = sql<Guardrail[]>`
        SELECT * FROM guardrails WHERE tool_name = ${filters.toolName}
      `;
    }

    if (filters?.enabled !== undefined) {
      query = sql<Guardrail[]>`
        SELECT * FROM guardrails
        WHERE enabled = ${filters.enabled}
        ORDER BY priority ASC
      `;
    }

    return await query;
  }

  async updateRule(id: string, updates: Partial<Guardrail>): Promise<Guardrail | null> {
    const [updated] = await sql<Guardrail[]>`
      UPDATE guardrails
      SET
        name = COALESCE(${updates.name ?? null}, name),
        description = COALESCE(${updates.description ?? null}, description),
        priority = COALESCE(${updates.priority ?? null}, priority),
        type = COALESCE(${updates.type ?? null}, type),
        tool_name = COALESCE(${updates.tool_name ?? null}, tool_name),
        input_pattern = COALESCE(${updates.input_pattern ?? null}, input_pattern),
        conditions = COALESCE(${updates.conditions ? sql.json(updates.conditions as any) : null}, conditions),
        blocked = COALESCE(${updates.blocked ?? null}, blocked),
        requires_approval = COALESCE(${updates.requires_approval ?? null}, requires_approval),
        cost_budget_tokens = COALESCE(${updates.cost_budget_tokens ?? null}, cost_budget_tokens),
        enabled = COALESCE(${updates.enabled ?? null}, enabled),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (updated) {
      await policyEngine.refreshRules();
    }

    return updated || null;
  }

  async deleteRule(id: string): Promise<boolean> {
    const result = await sql`DELETE FROM guardrails WHERE id = ${id}`;

    if (result.count > 0) {
      await policyEngine.refreshRules();
      return true;
    }

    return false;
  }

  async toggleRule(id: string): Promise<Guardrail | null> {
    const rule = await this.getRuleById(id);
    if (!rule) return null;

    return this.updateRule(id, { enabled: !rule.enabled });
  }
}

export const ruleStore = new RuleStore();
