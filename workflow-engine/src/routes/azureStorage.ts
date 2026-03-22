import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  generateUploadSasUrl,
  generateDownloadSasUrl,
  generateContainerSasUrl,
  uploadBlob,
  downloadBlob,
  createTextBlob,
  listBlobs,
  deleteBlob,
} from '../services/azureStorage.service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100 MB

// POST /api/storage/sas/upload
router.post('/sas/upload', (req: Request, res: Response) => {
  const { container, blobName, expiresInMinutes } = req.body ?? {};
  if (!container || !blobName) {
    res.status(400).json({ error: 'container and blobName are required' });
    return;
  }
  try {
    const sasUrl = generateUploadSasUrl(container, blobName, expiresInMinutes ?? 60);
    res.json({ sasUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/storage/sas/download
router.post('/sas/download', (req: Request, res: Response) => {
  const { container, blobName, expiresInMinutes } = req.body ?? {};
  if (!container || !blobName) {
    res.status(400).json({ error: 'container and blobName are required' });
    return;
  }
  try {
    const sasUrl = generateDownloadSasUrl(container, blobName, expiresInMinutes ?? 60);
    res.json({ sasUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/storage/sas/container
router.post('/sas/container', (req: Request, res: Response) => {
  const { container, permissions, expiresInMinutes } = req.body ?? {};
  if (!container || !permissions) {
    res.status(400).json({ error: 'container and permissions are required' });
    return;
  }
  try {
    const sasUrl = generateContainerSasUrl(container, permissions, expiresInMinutes ?? 60);
    res.json({ sasUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/storage/:container/upload
router.post('/:container/upload', upload.single('file'), async (req: Request, res: Response) => {
  const container = req.params['container'] as string;
  const { blobName } = req.body ?? {};
  const file = req.file;

  if (!file) { res.status(400).json({ error: 'file is required' }); return; }

  const resolvedBlobName = blobName?.trim() || file.originalname;

  try {
    const blobUrl = await uploadBlob(container, resolvedBlobName, file.buffer, file.mimetype);
    res.status(201).json({ blobUrl, blobName: resolvedBlobName, size: file.size });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/storage/:container/create
router.post('/:container/create', async (req: Request, res: Response) => {
  const container = req.params['container'] as string;
  const { blobName, content, contentType } = req.body ?? {};

  if (!blobName || content === undefined) {
    res.status(400).json({ error: 'blobName and content are required' });
    return;
  }

  const resolvedContent = typeof content === 'string' ? content : JSON.stringify(content);
  const resolvedContentType = contentType ?? (typeof content === 'string' ? 'text/plain' : 'application/json');

  try {
    const blobUrl = await createTextBlob(container, blobName, resolvedContent, resolvedContentType);
    res.status(201).json({ blobUrl, blobName });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/storage/:container/download/:blobName
router.get('/:container/download/:blobName', async (req: Request, res: Response) => {
  const container = req.params['container'] as string;
  const blobName = req.params['blobName'] as string;

  try {
    const { stream, contentType, contentLength } = await downloadBlob(container, blobName);
    res.setHeader('Content-Disposition', `attachment; filename="${blobName}"`);
    res.setHeader('Content-Type', contentType ?? 'application/octet-stream');
    if (contentLength !== undefined) res.setHeader('Content-Length', contentLength);
    stream.pipe(res);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// GET /api/storage/:container/list
router.get('/:container/list', async (req: Request, res: Response) => {
  const container = req.params['container'] as string;
  const prefix = req.query['prefix'] as string | undefined;

  try {
    const blobs = await listBlobs(container, prefix);
    res.json(blobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/storage/:container/:blobName
router.delete('/:container/:blobName', async (req: Request, res: Response) => {
  const container = req.params['container'] as string;
  const blobName = req.params['blobName'] as string;

  try {
    await deleteBlob(container, blobName);
    res.status(204).send();
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

export default router;
