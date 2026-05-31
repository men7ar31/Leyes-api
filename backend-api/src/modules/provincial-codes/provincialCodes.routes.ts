import { Router } from 'express';
import { ProvincialCodesController } from './provincialCodes.controller';

const router = Router();

router.post('/document', ProvincialCodesController.getDocument);

export default router;
