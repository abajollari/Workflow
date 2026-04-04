const KAFKA_REST_URL = process.env.KAFKA_REST_URL ?? 'https://kafka-2b21041f-abajollari-cp.k.aivencloud.com:19286';
const KAFKA_REST_USERNAME = process.env.KAFKA_REST_USERNAME ?? 'avnadmin';
const KAFKA_REST_PASSWORD = process.env.KAFKA_REST_PASSWORD ?? '';

export async function publishToTopic(topic: string, records: unknown[]): Promise<void> {
  const url = `${KAFKA_REST_URL}/topics/${topic}`;
  const credentials = Buffer.from(`${KAFKA_REST_USERNAME}:${KAFKA_REST_PASSWORD}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.kafka.json.v2+json',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify({ records: records.map((value) => ({ value })) }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kafka REST error ${response.status}: ${text}`);
  }
}

export async function createConsumer(
  consumerGroup: string,
  consumerName: string,
  autoOffsetReset: 'earliest' | 'latest' = 'earliest',
): Promise<{ base_uri: string; instance_id: string; instanceUrl: string }> {
  const url = `${KAFKA_REST_URL}/consumers/${consumerGroup}`;
  const credentials = Buffer.from(`${KAFKA_REST_USERNAME}:${KAFKA_REST_PASSWORD}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.kafka.v2+json',
      'Accept': 'application/vnd.kafka.v2+json',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify({ name: consumerName, format: 'json', 'auto.offset.reset': autoOffsetReset }),
  });

  if (!response.ok && response.status !== 409) {
    const text = await response.text();
    throw new Error(`Kafka REST error ${response.status}: ${text}`);
  }

  // 409 = consumer already exists from a previous run — construct the instance URL directly
  // For all cases, build from KAFKA_REST_URL since Aiven's base_uri may use an internal hostname
  const instanceUrl = `${KAFKA_REST_URL}/consumers/${consumerGroup}/instances/${consumerName}`;
  return { base_uri: instanceUrl, instance_id: consumerName, instanceUrl };
}

export async function subscribeToTopics(baseUri: string, topics: string[]): Promise<void> {
  const credentials = Buffer.from(`${KAFKA_REST_USERNAME}:${KAFKA_REST_PASSWORD}`).toString('base64');

  const response = await fetch(`${baseUri}/subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.kafka.v2+json',
      'Accept': 'application/vnd.kafka.v2+json',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify({ topics }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kafka REST error ${response.status}: ${text}`);
  }
}

export async function consumeMessages<T = unknown>(baseUri: string, timeoutMs = 1000): Promise<T[]> {
  const credentials = Buffer.from(`${KAFKA_REST_USERNAME}:${KAFKA_REST_PASSWORD}`).toString('base64');

  const response = await fetch(`${baseUri}/records?timeout=${timeoutMs}&max_bytes=1048576`, {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.kafka.json.v2+json',
      'Authorization': `Basic ${credentials}`,
    },
    signal: AbortSignal.timeout(timeoutMs + 5000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Kafka REST error ${response.status}: ${text}`);
  }

  const records: { value: T }[] = await response.json();
  return records.map((r) => r.value);
}
