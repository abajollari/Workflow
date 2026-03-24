import type { Response } from 'express';
import { redisSub } from '../redis/client.js';

export interface WorkflowEvent {
  type: 'activity.completed';
  projectId: number;
  activityId: string;
  activityLabel: string;
  activatedActivities: string[];
  timestamp: string;
}

// Per-project SSE clients (local to this process)
const clients = new Map<number, Set<Response>>();

// Global SSE clients (local to this process)
const globalClients = new Set<Response>();

export function addWorkflowSseClient(projectId: number, res: Response): void {
  if (!clients.has(projectId)) clients.set(projectId, new Set());
  clients.get(projectId)!.add(res);
}

export function removeWorkflowSseClient(projectId: number, res: Response): void {
  clients.get(projectId)?.delete(res);
}

export function addGlobalSseClient(res: Response): void {
  globalClients.add(res);
}

export function removeGlobalSseClient(res: Response): void {
  globalClients.delete(res);
}

/** Broadcast an event to all SSE clients connected to THIS process. */
export function broadcastWorkflowEvent(event: WorkflowEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;

  const projectClients = clients.get(event.projectId);
  if (projectClients && projectClients.size > 0) {
    for (const client of projectClients) client.write(payload);
    console.log(`[sse] broadcast to ${projectClients.size} project client(s) for project ${event.projectId}`);
  }

  if (globalClients.size > 0) {
    for (const client of globalClients) client.write(payload);
    console.log(`[sse] broadcast to ${globalClients.size} global client(s)`);
  }
}

/** Close all open SSE connections (used during graceful shutdown). */
export function closeAllSseClients(): void {
  for (const clientSet of clients.values()) {
    for (const client of clientSet) {
      client.write('event: close\ndata: server restarting\n\n');
      client.end();
    }
  }
  clients.clear();

  for (const client of globalClients) {
    client.write('event: close\ndata: server restarting\n\n');
    client.end();
  }
  globalClients.clear();
  console.log('[sse] all clients closed');
}

// If Redis is available, subscribe so every process instance receives events
// published by whichever instance consumed the Kafka message.
if (redisSub) {
  redisSub.subscribe('workflow-events').catch((err) =>
    console.error('[redis] subscribe failed:', err)
  );
  redisSub.on('message', (_channel: string, message: string) => {
    try {
      const event = JSON.parse(message) as WorkflowEvent;
      broadcastWorkflowEvent(event);
    } catch {
      console.error('[redis] failed to parse workflow event');
    }
  });
  console.log('[redis] subscribed to workflow-events channel');
}
