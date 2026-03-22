import type { Response } from 'express';

export interface WorkflowEvent {
  type: 'activity.completed';
  projectId: number;
  activityId: string;
  activatedActivities: string[];
  timestamp: string;
}

// Per-project SSE clients
const clients = new Map<number, Set<Response>>();

// Global SSE clients
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
