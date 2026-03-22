import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  ContainerSASPermissions,
} from '@azure/storage-blob';
import { Readable } from 'stream';

function sanitizeContainerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .padEnd(3, '0');
}

function getCredential(): StorageSharedKeyCredential {
  const accountName = process.env['AZURE_STORAGE_ACCOUNT_NAME'];
  const accountKey = process.env['AZURE_STORAGE_ACCOUNT_KEY'];
  if (!accountName || !accountKey) {
    throw new Error('AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY must be set');
  }
  return new StorageSharedKeyCredential(accountName, accountKey);
}

function getBlobServiceClient(): BlobServiceClient {
  const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING'];
  if (connectionString) {
    return BlobServiceClient.fromConnectionString(connectionString);
  }
  const accountName = process.env['AZURE_STORAGE_ACCOUNT_NAME'];
  if (!accountName) throw new Error('AZURE_STORAGE_ACCOUNT_NAME must be set');
  return new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    getCredential(),
  );
}

export function generateUploadSasUrl(containerName: string, blobName: string, expiresInMinutes = 60): string {
  const accountName = process.env['AZURE_STORAGE_ACCOUNT_NAME'];
  if (!accountName) throw new Error('AZURE_STORAGE_ACCOUNT_NAME must be set');
  containerName = sanitizeContainerName(containerName);
  const credential = getCredential();
  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + expiresInMinutes * 60 * 1000);
  const sasParams = generateBlobSASQueryParameters(
    { containerName, blobName, permissions: BlobSASPermissions.parse('rcw'), startsOn, expiresOn },
    credential,
  );
  return `https://${accountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(blobName)}?${sasParams.toString()}`;
}

export function generateDownloadSasUrl(containerName: string, blobName: string, expiresInMinutes = 60): string {
  const accountName = process.env['AZURE_STORAGE_ACCOUNT_NAME'];
  if (!accountName) throw new Error('AZURE_STORAGE_ACCOUNT_NAME must be set');
  containerName = sanitizeContainerName(containerName);
  const credential = getCredential();
  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + expiresInMinutes * 60 * 1000);
  const sasParams = generateBlobSASQueryParameters(
    { containerName, blobName, permissions: BlobSASPermissions.parse('r'), startsOn, expiresOn },
    credential,
  );
  return `https://${accountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(blobName)}?${sasParams.toString()}`;
}

export function generateContainerSasUrl(containerName: string, permissions: string, expiresInMinutes = 60): string {
  const accountName = process.env['AZURE_STORAGE_ACCOUNT_NAME'];
  if (!accountName) throw new Error('AZURE_STORAGE_ACCOUNT_NAME must be set');
  containerName = sanitizeContainerName(containerName);
  const credential = getCredential();
  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + expiresInMinutes * 60 * 1000);
  const sasParams = generateBlobSASQueryParameters(
    { containerName, permissions: ContainerSASPermissions.parse(permissions), startsOn, expiresOn },
    credential,
  );
  return `https://${accountName}.blob.core.windows.net/${containerName}?${sasParams.toString()}`;
}

export async function uploadBlob(containerName: string, blobName: string, data: Buffer | Readable, contentType = 'application/octet-stream'): Promise<string> {
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(sanitizeContainerName(containerName));
  await containerClient.createIfNotExists();
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  if (Buffer.isBuffer(data)) {
    await blockBlobClient.uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
  } else {
    await blockBlobClient.uploadStream(data, undefined, undefined, { blobHTTPHeaders: { blobContentType: contentType } });
  }
  return blockBlobClient.url;
}

export async function downloadBlob(containerName: string, blobName: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string | undefined; contentLength: number | undefined }> {
  const client = getBlobServiceClient();
  const blobClient = client.getContainerClient(sanitizeContainerName(containerName)).getBlobClient(blobName);
  const response = await blobClient.download();
  if (!response.readableStreamBody) throw new Error('No readable stream returned from Azure');
  return { stream: response.readableStreamBody, contentType: response.contentType, contentLength: response.contentLength };
}

export async function createTextBlob(containerName: string, blobName: string, content: string, contentType = 'text/plain'): Promise<string> {
  return uploadBlob(containerName, blobName, Buffer.from(content, 'utf-8'), contentType);
}

export async function listBlobs(containerName: string, prefix?: string): Promise<Array<{ name: string; contentLength: number | undefined; lastModified: Date; contentType: string | undefined }>> {
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(sanitizeContainerName(containerName));
  const blobs: Array<{ name: string; contentLength: number | undefined; lastModified: Date; contentType: string | undefined }> = [];
  for await (const blob of containerClient.listBlobsFlat({ prefix, includeMetadata: true })) {
    blobs.push({ name: blob.name, contentLength: blob.properties.contentLength, lastModified: blob.properties.lastModified, contentType: blob.properties.contentType });
  }
  return blobs;
}

export async function deleteBlob(containerName: string, blobName: string): Promise<void> {
  const client = getBlobServiceClient();
  await client.getContainerClient(sanitizeContainerName(containerName)).deleteBlob(blobName);
}
