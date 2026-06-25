import axios from 'axios';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export type ContentBlock = ToolUseBlock | TextBlock;

export class LLMClient {
  private apiKey: string;
  private model: string = 'openai/gpt-4o-mini';
  private apiUrl: string = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
  }

  async callLLM(
    systemPrompt: string,
    tools: LLMToolDefinition[],
    conversationHistory: Array<any>
  ): Promise<ContentBlock[]> {
    const messages: any[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...conversationHistory.map((msg) => {
        const payload: any = {
          role: msg.role,
          content: msg.content || null,
        };
        if (msg.tool_calls) {
          payload.tool_calls = typeof msg.tool_calls === 'string' ? JSON.parse(msg.tool_calls) : msg.tool_calls;
        }
        if (msg.tool_call_id) {
          payload.tool_call_id = msg.tool_call_id;
        }
        return payload;
      }),
    ];

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages,
          tools: tools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema,
            },
          })),
          tool_choice: 'auto',
          max_tokens: 4096,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content: ContentBlock[] = [];
      const message = response.data.choices[0].message;

      if (message.content) {
        content.push({
          type: 'text',
          text: message.content,
        });
      }

      if (message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.type === 'function') {
            content.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.function.name,
              input: JSON.parse(toolCall.function.arguments || '{}'),
            });
          }
        }
      }

      return content;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('[LLM] OpenRouter API error:', error.response?.data || error.message);
        throw new Error(`LLM API error: ${error.message}`);
      }
      throw error;
    }
  }

  async parseToolCall(content: ContentBlock[]): Promise<ToolUseBlock | null> {
    for (const block of content) {
      if (block.type === 'tool_use') {
        return block;
      }
    }
    return null;
  }

  getTextResponse(content: ContentBlock[]): string {
    const textBlocks = content.filter((block) => block.type === 'text') as TextBlock[];
    return textBlocks.map((block) => block.text).join('\n');
  }

  convertToLLMTools(tools: Tool[]): LLMToolDefinition[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.inputSchema || { type: 'object', properties: {} },
    }));
  }

  setModel(model: string): void {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }
}

export const llmClient = new LLMClient();
