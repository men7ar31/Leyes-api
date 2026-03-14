import { Router } from 'express';
import { SaijController } from './saij.controller';

const router = Router();

router.post('/search', SaijController.search);

export default router;
