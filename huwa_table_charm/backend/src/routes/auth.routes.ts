import { Router } from 'express';
import { registerSchema, loginSchema, refreshSchema } from '@huwa/shared';
import { validate, asyncHandler } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/auth';
import * as auth from '../controllers/auth.controller';

const router = Router();

// Register & login are rate-limited to resist brute force
router.post('/register', authLimiter, validate(registerSchema), asyncHandler(auth.register));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(auth.login));
router.post('/refresh', validate(refreshSchema), asyncHandler(auth.refresh));
router.post('/logout', asyncHandler(auth.logout));

// Current logged-in user profile
router.get('/me', requireAuth, asyncHandler(auth.me));

export default router;
