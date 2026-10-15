import { Router } from 'express';
import { asyncHandler } from '../middleware/validate';
import { optionalAuth } from '../middleware/auth';
import * as catalog from '../controllers/catalog.controller';

const router = Router();

router.use(optionalAuth);

// Public catalog endpoints (published products only)
router.get('/products', asyncHandler(catalog.publicList));
router.get('/products/:slug', asyncHandler(catalog.getProduct));
router.get('/categories', asyncHandler(catalog.listCategories));
router.get('/bundles', asyncHandler(catalog.listBundles));

export default router;
