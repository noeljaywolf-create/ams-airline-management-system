import { Router } from 'express';
import express from 'express';
import { asyncHandler } from '../middleware/validate';
import * as webhook from '../controllers/webhook.controller';

const router = Router();

// Raw body is required for Stripe signature verification.
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  asyncHandler(webhook.webhook),
);

export default router;
