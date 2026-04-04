import { Kafka, logLevel, type SASLOptions } from 'kafkajs';
import { readFileSync } from 'fs';

const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');

const saslUsername = process.env.KAFKA_SASL_USERNAME;
const saslPassword = process.env.KAFKA_SASL_PASSWORD;
const saslMechanism = (process.env.KAFKA_SASL_MECHANISM ?? 'scram-sha-256') as SASLOptions['mechanism'];

const sasl: SASLOptions | undefined =
  saslUsername && saslPassword
    ? { mechanism: saslMechanism, username: saslUsername, password: saslPassword }
    : undefined;

const sslConfig = sasl
  ? process.env.KAFKA_SSL_CA_PATH
    ? { ca: [readFileSync(process.env.KAFKA_SSL_CA_PATH)] }
    : { rejectUnauthorized: true }
  : undefined;

if (sasl) {
  const certInfo = process.env.KAFKA_SSL_CA_PATH ? `CA: ${process.env.KAFKA_SSL_CA_PATH}` : 'rejectUnauthorized: false';
  console.log(`[kafka] using SASL authentication (${saslMechanism}) with SSL (${certInfo})`);
} else {
  console.log('[kafka] using plain (no SASL) connection');
}

const kafka = new Kafka({
  clientId: 'workflow-engine',
  brokers,
  ssl: sslConfig,
  sasl,
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 500,
    retries: 15,
    factor: 1.5,
    maxRetryTime: 15_000,
  },
});

export default kafka;
