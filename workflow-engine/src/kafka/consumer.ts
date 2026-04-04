import kafka from './client.js';
import { broadcastWorkflowEvent, type WorkflowEvent } from './events.js';
import { redisPub } from '../redis/client.js';
import { createConsumer, subscribeToTopics, consumeMessages } from './kafkaHttp.js';

const admin = kafka.admin();
const consumer = kafka.consumer({
  groupId: 'workflow-engine-consumer-group',
  sessionTimeout: 30_000,
  heartbeatInterval: 3_000,
});

async function ensureTopicExists(topic: string): Promise<void> {
  await admin.connect();
  const existing = await admin.listTopics();
  if (!existing.includes(topic)) {
    await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] });
    console.log(`[kafka] created topic: ${topic}`);
  }
  await admin.disconnect();
}

export async function stopWorkflowConsumer(): Promise<void> {
  await consumer.disconnect();
  console.log('[kafka] workflow consumer disconnected');
}

export async function startWorkflowConsumerViaHttp(pollIntervalMs = 1000): Promise<() => void> {
  const { instanceUrl } = await createConsumer('workflow-engine-consumer-group', 'workflow-engine-consumer');
  await subscribeToTopics(instanceUrl, ['workflow-events']);
  console.log('[kafka-http] workflow consumer subscribed to workflow-events');

  const interval = setInterval(async () => {
    try {
      const events = await consumeMessages<WorkflowEvent>(instanceUrl);
      for (const event of events) {
        console.log(`[kafka-http] consumed ${event.type} for project ${event.projectId}`);
        if (redisPub) {
          await redisPub.publish('workflow-events', JSON.stringify(event));
        } else {
          broadcastWorkflowEvent(event);
        }
      }
    } catch (err) {
      console.error('[kafka-http] failed to consume messages', err);
    }
  }, pollIntervalMs);

  return () => {
    clearInterval(interval);
    console.log('[kafka-http] workflow consumer stopped');
  };
}

export async function startWorkflowConsumer(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 4500));

  await ensureTopicExists('workflow-events');

  await consumer.connect();
  console.log('[kafka] workflow consumer connected');

  await consumer.subscribe({ topic: 'workflow-events', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const event = JSON.parse(message.value.toString()) as WorkflowEvent;
        console.log(`[kafka] consumed ${event.type} for project ${event.projectId}`);
        if (redisPub) {
          // Fan-out via Redis so ALL process instances broadcast to their local SSE clients
          await redisPub.publish('workflow-events', message.value.toString());
        } else {
          // Single-instance fallback: broadcast directly
          broadcastWorkflowEvent(event);
        }
      } catch {
        console.error('[kafka] failed to parse workflow event');
      }
    },
  });
}
