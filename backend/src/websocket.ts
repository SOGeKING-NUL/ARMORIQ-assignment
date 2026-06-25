import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

export interface WebSocketMessage {
  type: 'RULE_UPDATED' | 'RULE_CREATED' | 'RULE_DELETED' | 'CONVERSATION_UPDATE' | 'APPROVAL_REQUEST';
  data: any;
  timestamp: string;
}

export class RealTimeSync {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(httpServer: Server) {
    this.wss = new WebSocketServer({ server: httpServer });
    this.setupHandlers();
  }

  private setupHandlers() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WebSocket] New client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] Error:', error);
        this.clients.delete(ws);
      });

      ws.send(
        JSON.stringify({
          type: 'CONNECTED',
          message: 'Connected to real-time updates',
          timestamp: new Date().toISOString(),
        })
      );
    });
  }

  broadcast(message: WebSocketMessage) {
    const payload = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  broadcastRuleUpdate(rule: any) {
    this.broadcast({
      type: 'RULE_UPDATED',
      data: rule,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastRuleCreated(rule: any) {
    this.broadcast({
      type: 'RULE_CREATED',
      data: rule,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastRuleDeleted(ruleId: string) {
    this.broadcast({
      type: 'RULE_DELETED',
      data: { id: ruleId },
      timestamp: new Date().toISOString(),
    });
  }

  broadcastConversationUpdate(conversationId: string, data: any) {
    this.broadcast({
      type: 'CONVERSATION_UPDATE',
      data: { conversationId, ...data },
      timestamp: new Date().toISOString(),
    });
  }

  broadcastApprovalRequest(approval: any) {
    this.broadcast({
      type: 'APPROVAL_REQUEST',
      data: approval,
      timestamp: new Date().toISOString(),
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export let realTimeSync: RealTimeSync;

export function initializeWebSocket(httpServer: Server) {
  realTimeSync = new RealTimeSync(httpServer);
  console.log('[WebSocket] Initialized');
}
