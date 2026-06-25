import { llmClient, LLMToolDefinition, ToolUseBlock } from './llm-client.js';
import { mcpRegistry } from '../mcp/mcp-registry.js';
import { policyEngine } from '../policy/policy-engine.js';
import { conversationStore } from '../db/conversation-store.js';
import { Conversation } from '../db/types.js';

export interface AgentConfig {
  systemPrompt?: string;
  maxIterations?: number;
}

export interface ToolCallResult {
  toolName: string;
  input: Record<string, unknown>;
  output: any;
  policyDecision: 'ALLOWED' | 'BLOCKED' | 'REQUIRES_APPROVAL';
  policyReason: string;
}

export interface AgentResponse {
  conversationId: string;
  finalResponse: string;
  toolCalls: ToolCallResult[];
  tokenUsage: number;
}

export class Agent {
  private config: AgentConfig;
  private defaultSystemPrompt = `You are a helpful AI assistant with access to various tools.
Your task is to help the user accomplish their goals by using the available tools effectively.
Always be clear about what you're doing and why.
If a tool call is blocked or requires approval, inform the user and wait for their decision.
When registering a runner, always collect name, age, and email in a single message before calling the tool. Never call register_runner_for_marathon unless you have all three fields confirmed.
CRITICAL: You must ALWAYS use the Exa web search tool to find up-to-date information, recent events, dates, or facts. Do NOT rely on your internal knowledge for such queries, and NEVER respond with a knowledge cutoff date limitation.`;

  constructor(config: AgentConfig = {}) {
    this.config = {
      maxIterations: 10,
      ...config,
    };
  }

  async run(userMessageText: string, conversationId?: string): Promise<AgentResponse> {
    let conversation: Conversation;

    if (conversationId) {
      const existing = await conversationStore.getConversation(conversationId);
      if (!existing) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }
      conversation = existing;
    } else {
      conversation = await conversationStore.createConversation();
    }

    const tools = mcpRegistry.getTools();
    const llmTools = llmClient.convertToLLMTools(tools);

    const dbMessages = await conversationStore.getMessages(conversation.id);
    const conversationHistory: Array<any> = dbMessages.map(m => ({
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls,
      tool_call_id: m.tool_call_id
    }));

    if (userMessageText) {
      await conversationStore.appendMessage(conversation.id, 'user', userMessageText);
      conversationHistory.push({ role: 'user', content: userMessageText });
    }

    const toolCalls: ToolCallResult[] = [];
    let iterations = 0;
    let finalResponse = '';

    while (iterations < (this.config.maxIterations || 10)) {
      iterations++;

      try {
        const baseSystemPrompt = this.config.systemPrompt || this.defaultSystemPrompt;
        const now = new Date();
        const dateContext = `\n\n[Current Context]\n- Current Date: ${now.toDateString()}\n- Current Year: ${now.getFullYear()}\n- Current ISO Time: ${now.toISOString()}\nUse this context to resolve relative date expressions (e.g. 'today', 'tomorrow', 'this winter', 'next year') correctly in your search queries and tool calls. If the user asks for 'this winter', formulate a search query targeted to the current year ${now.getFullYear()} (or subsequent months in early ${now.getFullYear() + 1}).`;
        const systemPromptWithContext = `${baseSystemPrompt}${dateContext}`;

        const responseBlocks = await llmClient.callLLM(
          systemPromptWithContext,
          llmTools,
          conversationHistory
        );

        const textResponse = llmClient.getTextResponse(responseBlocks);
        const toolUseBlock = await llmClient.parseToolCall(responseBlocks);

        if (toolUseBlock) {
          const toolCallsPayload = [{
            id: toolUseBlock.id,
            type: 'function',
            function: {
              name: toolUseBlock.name,
              arguments: JSON.stringify(toolUseBlock.input)
            }
          }];
          await conversationStore.appendMessage(
            conversation.id, 'assistant', textResponse || undefined, toolCallsPayload
          );
          conversationHistory.push({
            role: 'assistant',
            content: textResponse || null,
            tool_calls: toolCallsPayload
          });
        } else {
          await conversationStore.appendMessage(conversation.id, 'assistant', textResponse);
          conversationHistory.push({ role: 'assistant', content: textResponse });
          finalResponse = textResponse;
          break;
        }

        const toolName = toolUseBlock.name;
        const toolInput = toolUseBlock.input;

        const decision = await policyEngine.evaluate(
          toolName,
          toolInput,
          conversation.user_id,
          conversation.id
        );

        const toolCall: ToolCallResult = {
          toolName,
          input: toolInput,
          output: null,
          policyDecision: decision.requiresApproval ? 'REQUIRES_APPROVAL' : decision.allowed ? 'ALLOWED' : 'BLOCKED',
          policyReason: decision.reason,
        };

        let toolResultStr = '';

        if (!decision.allowed) {
          await conversationStore.logToolCall(
            conversation.id, toolName, toolInput, 'BLOCKED', decision.reason
          );
          toolCall.output = { error: `Tool blocked: ${decision.reason}` };
          toolCalls.push(toolCall);
          toolResultStr = JSON.stringify(toolCall.output);
        } else if (decision.requiresApproval) {
          const approval = await conversationStore.createPendingApproval(conversation.id, toolName, toolInput);
          try {
            const { realTimeSync } = await import('../websocket.js');
            if (realTimeSync) {
              realTimeSync.broadcastApprovalRequest(approval);
            }
          } catch (err) {
            console.error('[Agent] Failed to broadcast approval request:', err);
          }
          await conversationStore.logToolCall(
            conversation.id, toolName, toolInput, 'REQUIRES_APPROVAL', decision.reason
          );
          toolCall.policyDecision = 'REQUIRES_APPROVAL';
          toolCalls.push(toolCall);
          toolResultStr = JSON.stringify({ error: `Tool requires approval. Admin notified.` });
        } else {
          try {
            const toolOutput = await mcpRegistry.callTool(toolName, toolInput);
            await conversationStore.logToolCall(
              conversation.id, toolName, toolInput, 'ALLOWED', decision.reason, toolOutput
            );
            toolCall.output = toolOutput;
            toolCall.policyDecision = 'ALLOWED';
            toolCalls.push(toolCall);
            toolResultStr = JSON.stringify(toolOutput);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await conversationStore.logToolCall(
              conversation.id, toolName, toolInput, 'ALLOWED', decision.reason, { error: errorMsg }
            );
            toolCall.output = { error: errorMsg };
            toolCalls.push(toolCall);
            toolResultStr = JSON.stringify(toolCall.output);
          }
        }

        await conversationStore.appendMessage(
          conversation.id, 'tool', toolResultStr, undefined, toolUseBlock.id
        );
        conversationHistory.push({
          role: 'tool',
          content: toolResultStr,
          tool_call_id: toolUseBlock.id
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[Agent] Error in loop:', errorMsg);
        finalResponse = `Error: ${errorMsg}`;
        break;
      }
    }

    await conversationStore.updateConversation(conversation.id, {
      status: iterations >= (this.config.maxIterations || 10) ? 'paused' : 'completed',
      token_count: iterations * 500,
    });

    return {
      conversationId: conversation.id,
      finalResponse,
      toolCalls,
      tokenUsage: iterations * 500,
    };
  }
}

export const agent = new Agent();
