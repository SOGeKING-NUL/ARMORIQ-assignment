import express, { Request, Response } from 'express';
import { agent } from '../agent/agent.js';
import { ruleStore } from '../policy/rule-store.js';
import { policyEngine } from '../policy/policy-engine.js';
import { conversationStore } from '../db/conversation-store.js';
import { mcpRegistry } from '../mcp/mcp-registry.js';
import { realTimeSync } from '../websocket.js';

export const router = express.Router();

router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

router.get('/tools', async (req: Request, res: Response) => {
  try {
    const tools = mcpRegistry.getTools();
    res.json({ tools });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/conversations', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    const conversation = await conversationStore.createConversation(userId);
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const conversation = await conversationStore.getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/conversations/:id/messages', async (req: Request, res: Response) => {
  try {
    const messages = await conversationStore.getMessages(req.params.id);
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/conversations/:id/messages', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await agent.run(message, req.params.id);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/conversations/:id/audit-log', async (req: Request, res: Response) => {
  try {
    const log = await conversationStore.getAuditLog(req.params.id);
    res.json({ log });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/rules', async (req: Request, res: Response) => {
  try {
    const { toolName, enabled } = req.query;
    const rules = await ruleStore.listRules({
      toolName: toolName as string,
      enabled: enabled === 'true' ? true : enabled === 'false' ? false : undefined,
    });
    res.json({ rules });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/rules', async (req: Request, res: Response) => {
  try {
    const rule = await ruleStore.createRule(req.body);
    realTimeSync.broadcastRuleCreated(rule);
    res.status(201).json(rule);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/rules/:id', async (req: Request, res: Response) => {
  try {
    const rule = await ruleStore.getRuleById(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    res.json(rule);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.put('/rules/:id', async (req: Request, res: Response) => {
  try {
    const updated = await ruleStore.updateRule(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    realTimeSync.broadcastRuleUpdate(updated);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.delete('/rules/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await ruleStore.deleteRule(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    realTimeSync.broadcastRuleDeleted(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.patch('/rules/:id/toggle', async (req: Request, res: Response) => {
  try {
    const updated = await ruleStore.toggleRule(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/approvals', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const approvals = await conversationStore.getPendingApprovals({
      status: status as string,
    });
    res.json({ approvals });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/approvals/:id/approve', async (req: Request, res: Response) => {
  try {
    const { approvedBy } = req.body;
    if (!approvedBy) {
      return res.status(400).json({ error: 'approvedBy is required' });
    }

    console.log(`[Routes] Processing approval for ID: ${req.params.id} by ${approvedBy}`);
    const updated = await conversationStore.approvePendingApproval(req.params.id, approvedBy);
    if (!updated) {
      console.log(`[Routes] Approval ID ${req.params.id} not found`);
      return res.status(404).json({ error: 'Approval not found' });
    }

    console.log(`[Routes] Approval ${updated.id} successfully updated in DB. Conversation: ${updated.conversation_id}`);

    // Append a system message to tell the LLM it was approved
    console.log(`[Routes] Appending system message to conversation ${updated.conversation_id}`);
    await conversationStore.appendMessage(
      updated.conversation_id,
      'user',
      `SYSTEM: The admin has approved the tool call execution for '${updated.tool_name}'. Please execute the exact same tool with the exact same arguments now to proceed.`
    );

    // Auto-resume agent loop in the background to execute the approved tool call
    console.log(`[Routes] Auto-resuming agent for conversation ${updated.conversation_id}`);
    agent.run('', updated.conversation_id).then((response) => {
      console.log(`[Routes] Agent auto-resume finished. Broadcasting update. tokenUsage: ${response.tokenUsage}`);
      realTimeSync.broadcastConversationUpdate(updated.conversation_id, response);
    }).catch((err) => {
      console.error('[Routes] Failed to resume agent after approval:', err);
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/approvals/:id/reject', async (req: Request, res: Response) => {
  try {
    const updated = await conversationStore.rejectPendingApproval(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: 'Approval not found' });
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
