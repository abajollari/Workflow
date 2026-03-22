import { Router, Request, Response } from 'express';
import db from '../db/database.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const teams = db.prepare('SELECT * FROM team ORDER BY id').all();
  res.json(teams);
});

export default router;
