import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, closeDatabase } from './db/client.js';
import { mcpRegistry } from './mcp/mcp-registry.js';
import { policyEngine } from './policy/policy-engine.js';
import { ruleStore } from './policy/rule-store.js';
import { router } from './api/routes.js';
import { initializeWebSocket } from './websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use('/api', router);

async function startup() {
  try {
    console.log('[Server] Starting up...');

    console.log('[Server] Initializing database...');
    await initializeDatabase();

    console.log('[Server] Registering MCP servers...');
    const marathonServerPath = path.join(projectRoot, 'custom-mcp-server', 'dist', 'index.js');
    console.log('[Server] Marathon server path:', marathonServerPath);

    await mcpRegistry.registerServer({
      name: 'marathon',
      command: 'node',
      args: [marathonServerPath],
    });

    console.log('[Server] Registering Exa MCP server...');
    await mcpRegistry.registerServer({
      name: 'exa',
      command: process.platform === 'win32' ? 'cmd.exe' : 'npx',
      args: process.platform === 'win32' ? ['/c', 'npx', '-y', 'exa-mcp-server'] : ['-y', 'exa-mcp-server'],
      env: {
        EXA_API_KEY: process.env.EXA_API_KEY || '',
      },
    });

    console.log('[Server] Discovering tools...');
    const tools = await mcpRegistry.discoverTools();
    console.log(`[Server] Discovered ${tools.length} tools`);

    console.log('[Server] Initializing policy engine...');
    await policyEngine.initialize();

    console.log('[Server] Seeding default guardrails...');
    const allRules = await ruleStore.listRules();
    const ageRuleExists = allRules.some((r) => r.name === 'Minimum age for marathon registration');
    if (!ageRuleExists) {
      await ruleStore.createRule({
        name: 'Minimum age for marathon registration',
        description: 'Runners must be at least 18 years old',
        type: 'VALIDATE',
        tool_name: 'register_runner_for_marathon',
        conditions: [{ field: 'runner_age', op: 'gte', value: 18, message: 'Runners must be at least 18 years old to register for a half-marathon.' }],
        priority: 10,
        enabled: true,
        blocked: false,
        requires_approval: false,
      });
      console.log('[Server] Seeded age guardrail.');
    }

    console.log('[Server] Initializing WebSocket server...');
    initializeWebSocket(httpServer);

    console.log('[Server] Starting HTTP server...');
    httpServer.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('[Server] Startup failed:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('[Server] Shutting down...');
  httpServer.close(async () => {
    await mcpRegistry.disconnect();
    await closeDatabase();
    process.exit(0);
  });
});
// Trigger reload for MCP tool discovery

startup();
