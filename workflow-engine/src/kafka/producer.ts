import kafka from './client.js';
import type { WorkflowEvent } from './events.js';

const producer = kafka.producer();
let connected = false;

async function connect(): Promise<void> {
  if (connected) return;
  await producer.connect();
  connected = true;
  console.log('[kafka] workflow producer connected');
}

export async function publishWorkflowEvent(event: WorkflowEvent): Promise<void> {
  await connect();
  await producer.send({
    topic: 'workflow-events',
    messages: [{ value: JSON.stringify(event) }],
  });
  console.log(`[kafka] published ${event.type} for project ${event.projectId}, activated: [${event.activatedActivities.join(', ')}]`);
}
