import { Kafka, logLevel } from 'kafkajs';

const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');

const kafka = new Kafka({
  clientId: 'workflow-engine',
  brokers,
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 500,
    retries: 15,
    factor: 1.5,
    maxRetryTime: 15_000,
  },
});

export default kafka;
