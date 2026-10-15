import { Router } from 'express';
import { z } from 'zod';
import { cartAddSchema, cartUpdateSchema } from '@huwa/shared';
import { validate, asyncHandler } from '../middleware/validate';
import { optionalAuth } from '../middleware/auth';
import * as cart from '../controllers/cart.controller';

const router = Router();

router.use(optionalAuth);

router.get('/cart', asyncHandler(cart.getCart));
router.post('/cart/items', validate(cartAddSchema), asyncHandler(cart.addItem));
router.post('/cart/items/batch', validate(z.object({ items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(100) })).min(1).max(20) })), asyncHandler(cart.addBatch));
router.patch('/cart/items/:itemId', validate(cartUpdateSchema), asyncHandler(cart.updateItem));
router.delete('/cart', asyncHandler(cart.clearCart));

export default router;
