import { Router } from 'express';
import { SaijController } from './saij.controller';

const router = Router();

router.post('/search', SaijController.search);
router.get('/document/:guid', SaijController.getDocument);
router.get('/debug/friendly-url/:guid', SaijController.debugFriendly);

export default router;
