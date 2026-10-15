import { Router } from 'express';
import { productCreateSchema, variantCreateSchema } from '@huwa/shared';
import { validate, asyncHandler } from '../middleware/validate';
import { requireAuth, requireRoles } from '../middleware/auth';
import { recordAudit } from '../middleware/audit';
import * as admin from '../controllers/admin.controller';

const router = Router();

// All admin routes require authentication + admin/merchant/support role
router.use(requireAuth, requireRoles('admin', 'merchant', 'support'), recordAudit);

// Dashboard
router.get('/admin/stats', asyncHandler(admin.dashboardStats));

// Products
router.get('/admin/products', asyncHandler(admin.listAllProducts));
router.post('/admin/products', validate(productCreateSchema), asyncHandler(admin.createProduct));
router.patch('/admin/products/:productId', asyncHandler(admin.updateProduct));
router.post('/admin/products/:productId/variants', validate(variantCreateSchema), asyncHandler(admin.createVariant));

// Categories
router.post('/admin/categories', asyncHandler(admin.createCategory));

// Inventory
router.get('/admin/stock/alerts', asyncHandler(admin.lowStockAlerts));
router.get('/admin/production', asyncHandler(admin.listProductionJobs));
router.get('/admin/stock/:variantId', asyncHandler(admin.getStock));
router.post('/admin/stock/:variantId/restock', asyncHandler(admin.restock));
router.post('/admin/stock/:variantId/adjust', asyncHandler(admin.adjustStock));

// Orders
router.get('/admin/orders', asyncHandler(admin.listAllOrders));
router.patch('/admin/orders/:orderId/state', asyncHandler(admin.adminTransitionOrder));

export default router;
