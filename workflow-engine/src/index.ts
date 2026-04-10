import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import projectRouter from './routes/project.js';
import activitiesRouter from './routes/activities.js';
import workflowRouter from './routes/workflow.js';
import teamsRouter from './routes/teams.js';
import usersRouter from './routes/users.js';
import artifactsRouter from './routes/artifacts.js';
import eventsRouter from './routes/events.js';
import callbackRouter from './routes/callback.js';
import webhooksRouter from './routes/webhooks.js';
import pendingRouter from './routes/pending.js';
import docusignRouter from './routes/docusign.js';
import azureStorageRouter from './routes/azureStorage.js';
import salesforceRouter from './routes/salesforce.js';
import { initDb } from './db/initDb.js';
import { registerAllHandlers } from './handlers/index.js';
import { startWorkflowConsumer, startWorkflowConsumerViaHttp, stopWorkflowConsumer } from './kafka/consumer.js';
import { addWorkflowSseClient, removeWorkflowSseClient, addGlobalSseClient, removeGlobalSseClient, closeAllSseClients } from './kafka/events.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

initDb();
registerAllHandlers();
const useKafkaHttp = process.env.KAFKA_USE_HTTP === 'true';
if (useKafkaHttp) {
  startWorkflowConsumerViaHttp().catch((err) => console.error('[kafka-http] workflow consumer failed to start:', err));
} else {
  startWorkflowConsumer().catch((err) => console.error('[kafka] workflow consumer failed to start:', err));
}

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
}));
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/projects', projectRouter);
app.use('/api/projects', activitiesRouter);
app.use('/api/workflow', workflowRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/users', usersRouter);
app.use('/api/projects', artifactsRouter);
app.use('/api/projects', eventsRouter);
app.use('/api/callback', callbackRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/activities/pending', pendingRouter);
app.use('/api/docusign', docusignRouter);
app.use('/api/storage', azureStorageRouter);
app.use('/api/salesforce', salesforceRouter);

// Workflow SSE — clients subscribe with ?projectId=X
app.get('/api/workflow/stream', (req: Request, res: Response) => {
  const projectId = Number(req.query['projectId']);
  if (!projectId) {
    res.status(400).json({ error: 'projectId query param required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN ?? 'http://localhost:4200');
  res.flushHeaders();

  req.socket?.setNoDelay(true);
  res.write('retry: 3000\n\n');
  res.write(': connected\n\n');

  addWorkflowSseClient(projectId, res);
  console.log(`[sse] workflow client connected for project ${projectId}`);

  req.on('close', () => {
    removeWorkflowSseClient(projectId, res);
    console.log(`[sse] workflow client disconnected for project ${projectId}`);
  });
});

// Global workflow SSE — receives every event across all projects (used for notifications)
app.get('/api/workflow/stream/global', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN ?? 'http://localhost:4200');
  res.flushHeaders();

  req.socket?.setNoDelay(true);
  res.write('retry: 3000\n\n');
  res.write(': connected\n\n');

  addGlobalSseClient(res);
  console.log('[sse] global client connected');

  req.on('close', () => {
    removeGlobalSseClient(res);
    console.log('[sse] global client disconnected');
  });
});

const server = app.listen(PORT, () => {
  console.log(`[workflow-engine] running on http://localhost:${PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[workflow-engine] ${signal} received — shutting down gracefully`);
  server.close();            // stop accepting new HTTP connections
  closeAllSseClients();      // push close event to all SSE clients, free sockets
  await stopWorkflowConsumer().catch(() => {}); // disconnect Kafka consumer
  process.exit(0);
}

process.on('SIGTERM', () => { shutdown('SIGTERM').catch(console.error); });
process.on('SIGINT',  () => { shutdown('SIGINT').catch(console.error); });
