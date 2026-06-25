import { MCPClient, MCPConnectionConfig } from './mcp-client.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface DiscoveredTool extends Tool {
  server: string;
}

export class MCPRegistry {
  private clients: Map<string, MCPClient> = new Map();
  private tools: Map<string, DiscoveredTool> = new Map();

  async registerServer(config: MCPConnectionConfig): Promise<void> {
    const client = new MCPClient(config);
    await client.connect();
    this.clients.set(config.name, client);
    console.log(`[MCP Registry] Registered server: ${config.name}`);
  }

  async discoverTools(): Promise<DiscoveredTool[]> {
    this.tools.clear();

    for (const [serverName, client] of this.clients) {
      try {
        const serverTools = await client.getTools();
        for (const tool of serverTools) {
          const toolKey = `${serverName}:${tool.name}`;
          const discoveredTool: DiscoveredTool = {
            ...tool,
            server: serverName,
          };
          this.tools.set(toolKey, discoveredTool);
        }
        console.log(`[MCP Registry] Discovered ${serverTools.length} tools from ${serverName}`);
      } catch (error) {
        console.error(`[MCP Registry] Failed to discover tools from ${serverName}:`, error);
      }
    }

    return Array.from(this.tools.values());
  }

  getTools(): DiscoveredTool[] {
    return Array.from(this.tools.values());
  }

  getToolsByServer(serverName: string): DiscoveredTool[] {
    return Array.from(this.tools.values()).filter((t) => t.server === serverName);
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    for (const [serverName, client] of this.clients) {
      const serverTools = await client.getTools();
      if (serverTools.some((t) => t.name === toolName)) {
        return await client.callTool(toolName, args);
      }
    }

    throw new Error(`Tool not found: ${toolName}`);
  }

  async findToolServer(toolName: string): Promise<string | null> {
    for (const [serverName, client] of this.clients) {
      const serverTools = await client.getTools();
      if (serverTools.some((t) => t.name === toolName)) {
        return serverName;
      }
    }
    return null;
  }

  async disconnect(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
    this.tools.clear();
  }
}

export const mcpRegistry = new MCPRegistry();
