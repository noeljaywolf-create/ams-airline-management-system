import { Router } from 'express';
import { asyncHandler } from '../middleware/validate';
import { optionalAuth } from '../middleware/auth';
import * as agent from '../controllers/agent.controller';

const router = Router();

router.use(optionalAuth);

// Chat with the Charm Agent
router.post('/agent/chat', asyncHandler(agent.chat));

// Direct tool endpoints (also usable from the widget or admin)
router.get('/agent/search', asyncHandler(agent.searchProducts));
router.get('/agent/compatibility/:variantId', asyncHandler(agent.checkCompatibility));
router.post('/agent/bundles', asyncHandler(agent.recommendBundles));
router.post('/agent/cart', asyncHandler(agent.addToCart));
router.get('/agent/track/:orderNumber', asyncHandler(agent.trackOrder));

export default router;
