import { Router, Request, Response } from 'express';
import db from '../db/database.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const { teamId } = req.query;
  if (teamId) {
    const users = db.prepare('SELECT * FROM user WHERE teamId = ? ORDER BY id').all(Number(teamId));
    res.json(users);
  } else {
    const users = db.prepare('SELECT * FROM user ORDER BY id').all();
    res.json(users);
  }
});

router.post('/', (req: Request, res: Response) => {
  const { name, email, teamId } = req.body ?? {};

  if (!name || !email || !teamId) {
    res.status(400).json({ error: 'name, email, and teamId are required' });
    return;
  }

  const team = db.prepare('SELECT id FROM team WHERE id = ?').get(Number(teamId));
  if (!team) {
    res.status(400).json({ error: 'Team not found' });
    return;
  }

  try {
    const result = db
      .prepare('INSERT INTO user (name, email, teamId) VALUES (?, ?, ?)')
      .run(name, email, Number(teamId));
    const created = db.prepare('SELECT * FROM user WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'email already exists' });
      return;
    }
    throw err;
  }
});

export default router;
