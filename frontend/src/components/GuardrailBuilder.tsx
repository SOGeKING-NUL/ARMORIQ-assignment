import { useState } from 'react';
import { apiClient } from '../api/client';
import '../styles/GuardrailBuilder.css';

interface GuardrailBuilderProps {
  rules: any[];
  tools?: any[];
  onRuleCreated: () => void;
}

export default function GuardrailBuilder({ rules, tools, onRuleCreated }: GuardrailBuilderProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    priority: 100,
    type: 'BLOCK',
    tool_name: '*',
    blocked: false,
    requires_approval: false,
    input_pattern: '',
    conditions: [] as any[],
    cost_budget_tokens: 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        blocked: formData.type === 'BLOCK',
        requires_approval: formData.type === 'REQUIRE_APPROVAL',
      };
      if (editingId) {
        await apiClient.updateRule(editingId, payload);
      } else {
        await apiClient.createRule(payload);
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({
        name: '',
        description: '',
        priority: 100,
        type: 'BLOCK',
        tool_name: '*',
        blocked: false,
        requires_approval: false,
        input_pattern: '',
        conditions: [],
        cost_budget_tokens: 0,
      });
      onRuleCreated();
    } catch (error) {
      console.error('Failed to create rule:', error);
    }
  };

  const handleToggleRule = async (ruleId: string) => {
    try {
      await apiClient.toggleRule(ruleId);
      onRuleCreated();
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await apiClient.deleteRule(ruleId);
      onRuleCreated();
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handleEditRule = (rule: any) => {
    let parsedConditions = [];
    if (rule.conditions) {
      if (typeof rule.conditions === 'string') {
        try {
          parsedConditions = JSON.parse(rule.conditions);
        } catch (e) {
          console.error('Failed to parse rule conditions string:', e);
        }
      } else if (Array.isArray(rule.conditions)) {
        parsedConditions = rule.conditions;
      }
    }

    setFormData({
      name: rule.name,
      description: rule.description || '',
      priority: rule.priority,
      type: rule.type,
      tool_name: rule.tool_name,
      blocked: rule.blocked || false,
      requires_approval: rule.requires_approval || false,
      input_pattern: rule.input_pattern || '',
      conditions: parsedConditions,
      cost_budget_tokens: rule.cost_budget_tokens || 0,
    });
    setEditingId(rule.id);
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      name: '',
      description: '',
      priority: 100,
      type: 'BLOCK',
      tool_name: '*',
      blocked: false,
      requires_approval: false,
      input_pattern: '',
      conditions: [],
      cost_budget_tokens: 0,
    });
  };

  return (
    <div className="guardrail-builder">
      <div className="builder-header">
        <h2>Guardrails</h2>
        <button onClick={() => showForm ? handleCancelForm() : setShowForm(true)} className="btn-secondary">
          {showForm ? 'Cancel' : '+ New Rule'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rule-form">
          <div className="form-group">
            <label htmlFor="rule-name" className="form-label">Rule Name</label>
            <input
              id="rule-name"
              type="text"
              placeholder="e.g. Block underage registration"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <span className="helper-text">A short, descriptive name to identify this guardrail in logs and policies.</span>
          </div>

          <div className="form-group">
            <label htmlFor="rule-description" className="form-label">Description (Optional)</label>
            <textarea
              id="rule-description"
              placeholder="e.g. Prevents users under 18 years from successfully calling registration tools."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            ></textarea>
            <span className="helper-text">Provide context on why this rule exists and what business policies it enforces.</span>
          </div>

          <div className="form-group">
            <label htmlFor="rule-type" className="form-label">Guardrail Action / Mode</label>
            <select
              id="rule-type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            >
              <option value="BLOCK">Block Tool Execution</option>
              <option value="REQUIRE_APPROVAL">Require Admin Approval</option>
              <option value="VALIDATE">Validate Tool Input Arguments</option>
              <option value="BUDGET">Enforce Token Budget</option>
            </select>
            <span className="helper-text">Select how this guardrail acts when triggered by a tool execution request.</span>
          </div>

          <div className="form-group">
            <label htmlFor="rule-tool-name" className="form-label">Target Tool</label>
            <select
              id="rule-tool-name"
              value={formData.tool_name}
              onChange={(e) => setFormData({ ...formData, tool_name: e.target.value })}
            >
              <option value="*">* (All Tools - Global Policy)</option>
              {tools?.map((t: any) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
            <span className="helper-text">Select which specific tool triggers this guardrail, or apply it to all tools.</span>
          </div>

          <div className="form-group">
            <label htmlFor="rule-priority" className="form-label">Rule Priority</label>
            <input
              id="rule-priority"
              type="number"
              placeholder="100"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
            />
            <span className="helper-text">Rules are evaluated in ascending order (lowest number first, e.g. 10 runs before 100).</span>
          </div>

          {(formData.type === 'VALIDATE' || formData.type === 'REQUIRE_APPROVAL') && (
            <div className="conditions-builder" style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', background: '#fff' }}>
              <h4 style={{ marginBottom: '0.5rem', fontSize: '15px', color: '#333' }}>Semantic Conditions</h4>
              <p className="helper-text" style={{ marginBottom: '1rem' }}>Define checks on tool arguments (e.g. check if <code>runner_age</code> is greater than or equal to <code>18</code> or <code>runner_email</code> equals a specific address).</p>
              {formData.conditions.map((cond, idx) => (
                <div key={idx} className="condition-row" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Field name"
                    value={cond.field}
                    onChange={(e) => {
                      const newConds = [...formData.conditions];
                      newConds[idx].field = e.target.value;
                      setFormData({ ...formData, conditions: newConds });
                    }}
                  />
                  <select
                    value={cond.op}
                    onChange={(e) => {
                      const newConds = [...formData.conditions];
                      newConds[idx].op = e.target.value;
                      setFormData({ ...formData, conditions: newConds });
                    }}
                  >
                    <option value="lt">Less Than</option>
                    <option value="gt">Greater Than</option>
                    <option value="eq">Equals</option>
                    <option value="lte">Less or Equal</option>
                    <option value="gte">Greater or Equal</option>
                    <option value="ne">Not Equal</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Value"
                    value={cond.value}
                    onChange={(e) => {
                      const newConds = [...formData.conditions];
                      const val = e.target.value;
                      newConds[idx].value = isNaN(Number(val)) || val === '' ? val : Number(val);
                      setFormData({ ...formData, conditions: newConds });
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Validation Error Message"
                    value={cond.message || ''}
                    onChange={(e) => {
                      const newConds = [...formData.conditions];
                      newConds[idx].message = e.target.value;
                      setFormData({ ...formData, conditions: newConds });
                    }}
                  />
                  <button type="button" className="btn-small delete" onClick={() => {
                    const newConds = formData.conditions.filter((_, i) => i !== idx);
                    setFormData({ ...formData, conditions: newConds });
                  }}>X</button>
                </div>
              ))}
              <button type="button" className="btn-secondary btn-small" onClick={() => {
                setFormData({
                  ...formData,
                  conditions: [...formData.conditions, { field: '', op: 'eq', value: '', message: '' }]
                });
              }}>+ Add Condition</button>
              
              <h4 style={{ marginTop: '1.25rem', marginBottom: '0.5rem', fontSize: '14px', color: '#333' }}>Regex Input Pattern Matcher (Optional)</h4>
              <input
                type="text"
                placeholder="Regex pattern (e.g. ^[a-zA-Z]+$)"
                value={formData.input_pattern}
                onChange={(e) => setFormData({ ...formData, input_pattern: e.target.value })}
              />
              <span className="helper-text">Alternatively, provide a regular expression to validate the tool input payload.</span>
            </div>
          )}

          {formData.type === 'BUDGET' && (
            <div className="form-group">
              <label htmlFor="rule-budget" className="form-label">Token Budget Limit</label>
              <input
                id="rule-budget"
                type="number"
                placeholder="e.g. 5000"
                value={formData.cost_budget_tokens}
                onChange={(e) => setFormData({ ...formData, cost_budget_tokens: parseInt(e.target.value) || 0 })}
              />
              <span className="helper-text">The maximum number of LLM tokens allowed for a single conversation before blocking tool calls.</span>
            </div>
          )}

          <button type="submit" className="btn-primary">
            {editingId ? 'Update Rule' : 'Create Rule'}
          </button>
        </form>
      )}

      <div className="rules-list">
        {rules.length === 0 ? (
          <p className="empty-state">No guardrails defined. Create one to get started.</p>
        ) : (
          rules.map((rule) => (
            <div key={rule.id} className={`rule-item ${rule.enabled ? '' : 'disabled'}`}>
              <div className="rule-header">
                <h3>{rule.name}</h3>
                <span className="rule-type">{rule.type}</span>
              </div>
              <p className="rule-tool">Tool: {rule.tool_name}</p>
              {rule.description && <p className="rule-desc">{rule.description}</p>}
              <div className="rule-actions">
                <button onClick={() => handleEditRule(rule)} className="btn-small">
                  Edit
                </button>
                <button
                  onClick={() => handleToggleRule(rule.id)}
                  className={`btn-small ${rule.enabled ? 'disable' : 'enable'}`}
                >
                  {rule.enabled ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => handleDeleteRule(rule.id)} className="btn-small delete">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
