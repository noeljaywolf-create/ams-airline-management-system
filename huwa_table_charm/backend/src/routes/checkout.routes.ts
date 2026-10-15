import { Router } from 'express';
import { checkoutSchema, orderStateUpdateSchema } from '@huwa/shared';
import { validate, asyncHandler } from '../middleware/validate';
import { optionalAuth, requireAuth, requireRoles } from '../middleware/auth';
import * as order from '../controllers/order.controller';

const router = Router();

router.use(optionalAuth);

// Create order + payment intent from the cart
router.post('/checkout', validate(checkoutSchema), asyncHandler(order.checkout));

// Confirm a (mock/dev) payment and finalise the order to PAID
router.post('/checkout/:orderId/confirm', asyncHandler(order.confirmOrder));

// Authenticated: list your own orders (must precede :orderNumber catch-all)
router.get('/orders/mine', requireAuth, asyncHandler(order.getMyOrders));

// Public order lookup by number (for order tracking)
router.get('/orders/:orderNumber', asyncHandler(order.getOrderByNumber));

// Authenticated: fetch your own order
router.get('/orders/id/:orderId', requireAuth, asyncHandler(order.getOrder));

// Admin: transition order state (hybrid fulfilment side effects)
router.patch(
  '/orders/:orderId/state',
  requireAuth,
  requireRoles('admin', 'merchant', 'support'),
  validate(orderStateUpdateSchema),
  asyncHandler(order.transition),
);

export default router;
