import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface MCPConnectionConfig {
  name: string;
  command?: string;
  args?: string[];
  cwd?: string;
  url?: string;
  env?: Record<string, string>;
}

export class MCPClient {
  private client: Client;
  private transport: any;
  private connected: boolean = false;
  private config: MCPConnectionConfig;

  constructor(config: MCPConnectionConfig) {
    this.config = config;
    this.client = new Client({
      name: `armoriq-agent-${config.name}`,
      version: '1.0.0',
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      if (this.config.command) {
        // Stdio transport: the SDK spawns and owns the child process internally.
        if (!this.config.args || this.config.args.length === 0) {
          throw new Error(
            `Invalid MCP server config for "${this.config.name}": command=${this.config.command}, args=${this.config.args}`
          );
        }

        console.log(`[MCP] Spawning ${this.config.name} with:`, {
          command: this.config.command,
          args: this.config.args,
          cwd: this.config.cwd,
        });

        this.transport = new StdioClientTransport({
          command: this.config.command,
          args: this.config.args,
          env: {
            ...getDefaultEnvironment(),
            ...this.config.env,
          },
        });
      } else if (this.config.url) {
        // SSE transport for remote servers (future implementation)
        throw new Error('SSE transport not yet implemented');
      } else {
        throw new Error('Either command or url must be specified');
      }

      await this.client.connect(this.transport);
      this.connected = true;
      console.log(`[MCP] Connected to ${this.config.name}`);
    } catch (error) {
      console.error(`[MCP] Failed to connect to ${this.config.name}:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.client.close();
      this.connected = false;
      console.log(`[MCP] Disconnected from ${this.config.name}`);
    } catch (error) {
      console.error(`[MCP] Error disconnecting from ${this.config.name}:`, error);
    }
  }

  async getTools(): Promise<Tool[]> {
    if (!this.connected) {
      throw new Error(`Client not connected to ${this.config.name}`);
    }

    try {
      const response = await this.client.listTools();
      return response.tools || [];
    } catch (error) {
      console.error(`[MCP] Failed to get tools from ${this.config.name}:`, error);
      return [];
    }
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    if (!this.connected) {
      throw new Error(`Client not connected to ${this.config.name}`);
    }

    try {
      return await this.client.callTool({
        name: toolName,
        arguments: args,
      });
    } catch (error) {
      console.error(`[MCP] Failed to call tool ${toolName} on ${this.config.name}:`, error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getName(): string {
    return this.config.name;
  }
}
