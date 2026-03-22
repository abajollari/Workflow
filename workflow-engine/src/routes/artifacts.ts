import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import db from '../db/database.js';

const router = Router();

type ArtifactType = 'document' | 'email' | 'message' | 'communication';
const VALID_TYPES = new Set<ArtifactType>(['document', 'email', 'message', 'communication']);

const UPLOADS_ROOT = path.resolve('uploads');

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOADS_ROOT, `proj-${req.params.id}`);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB

// GET /api/projects/:id/artifacts
router.get('/:id/artifacts', (req: Request, res: Response) => {
  const projectId = Number(req.params.id);
  const { type } = req.query;

  const project = db.prepare('SELECT id FROM project WHERE id = ?').get(projectId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const artifacts = type && VALID_TYPES.has(type as ArtifactType)
    ? db.prepare('SELECT * FROM artifact WHERE projectId = ? AND type = ? ORDER BY createdAt DESC').all(projectId, type)
    : db.prepare('SELECT * FROM artifact WHERE projectId = ? ORDER BY createdAt DESC').all(projectId);

  res.json(artifacts);
});

// POST /api/projects/:id/artifacts  (multipart/form-data or JSON)
router.post('/:id/artifacts', upload.single('file'), (req: Request, res: Response) => {
  const projectId = Number(req.params.id);
  const { type, title, content } = req.body ?? {};

  const project = db.prepare('SELECT id FROM project WHERE id = ?').get(projectId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  if (!type || !VALID_TYPES.has(type)) {
    res.status(400).json({ error: `type must be one of: ${[...VALID_TYPES].join(', ')}` });
    return;
  }
  if (!title?.trim()) { res.status(400).json({ error: 'title is required' }); return; }

  const file = req.file;
  const result = db.prepare(
    `INSERT INTO artifact (projectId, type, title, content, fileName, filePath, mimeType, fileSize)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    projectId,
    type,
    title.trim(),
    content?.trim() ?? null,
    file?.originalname ?? null,
    file?.path ?? null,
    file?.mimetype ?? null,
    file?.size ?? null,
  );

  const created = db.prepare('SELECT * FROM artifact WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// GET /api/projects/:id/artifacts/:artifactId/file  — download
router.get('/:id/artifacts/:artifactId/file', (req: Request, res: Response) => {
  const artifact = db.prepare(
    'SELECT * FROM artifact WHERE id = ? AND projectId = ?'
  ).get(Number(req.params.artifactId), Number(req.params.id)) as any;

  if (!artifact) { res.status(404).json({ error: 'Artifact not found' }); return; }
  if (!artifact.filePath) { res.status(404).json({ error: 'No file attached' }); return; }

  if (!fs.existsSync(artifact.filePath)) {
    res.status(404).json({ error: 'File not found on disk' });
    return;
  }

  res.setHeader('Content-Disposition', `attachment; filename="${artifact.fileName}"`);
  res.setHeader('Content-Type', artifact.mimeType ?? 'application/octet-stream');
  fs.createReadStream(artifact.filePath).pipe(res);
});

// DELETE /api/projects/:id/artifacts/:artifactId
router.delete('/:id/artifacts/:artifactId', (req: Request, res: Response) => {
  const artifact = db.prepare(
    'SELECT * FROM artifact WHERE id = ? AND projectId = ?'
  ).get(Number(req.params.artifactId), Number(req.params.id)) as any;

  if (!artifact) { res.status(404).json({ error: 'Artifact not found' }); return; }

  if (artifact.filePath && fs.existsSync(artifact.filePath)) {
    fs.unlinkSync(artifact.filePath);
  }

  db.prepare('DELETE FROM artifact WHERE id = ?').run(artifact.id);
  res.status(204).send();
});

export default router;
