import path from 'node:path';
import {existsSync} from 'node:fs';
import express, { type Express } from 'express';
import cors from 'cors';
import db from './config/database';
import config from './config';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import catalogRoutes from './routes/catalog.routes';
import cartRoutes from './routes/cart.routes';
import checkoutRoutes from './routes/checkout.routes';
import webhookRoutes from './routes/webhook.routes';
import agentRoutes from './routes/agent.routes';
import adminRoutes from './routes/admin.routes';
import inquiryRoutes from './routes/inquiry.routes';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  if (process.env.RENDER === 'true') app.set('trust proxy', 1);

  app.use(
    cors({
      origin: config.allowedOrigins,
      credentials: true,
    }),
  );

  // Preserve the raw provider signature payload before parsing other JSON.
  app.use('/api/webhook', webhookRoutes);
  app.use(express.json({limit:'100kb'}));
  app.use('/api', apiLimiter);

  // Health check
  app.get('/api/health', async (_req, res) => {
    try {
      await db.raw('SELECT 1');
      res.json({ success: true, data: { status: 'ok', env: config.env, timestamp: new Date().toISOString() } });
    } catch {
      res.status(503).json({ success: false, error: 'Database unavailable' });
    }
  });



  app.use('/api', authRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', cartRoutes);
  app.use('/api', checkoutRoutes);

  app.use('/api', agentRoutes);
  app.use('/api', inquiryRoutes);
  app.use('/api', adminRoutes);

  app.use('/api', notFoundHandler);
  const staticDir = path.resolve(config.staticDir || '../frontend/dist');
  if (config.env === 'production' && existsSync(path.join(staticDir,'index.html'))) {
    app.use(express.static(staticDir,{index:false,maxAge:'1h'}));
    app.get('*',(req,res,next)=>{if(path.extname(req.path))return next();res.setHeader('Cache-Control','no-cache');res.sendFile(path.join(staticDir,'index.html'));});
  }
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// Bootstrap when run directly (dev/start). Kept so tests can import createApp() only.
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isDirectRun) {
  const app = createApp();
  const start = async () => {
    // Prepare beta schema without running the destructive full-catalog seed.
    if (config.env === 'production' && config.dbDriver === 'sqlite') {
      await db.migrate.latest();
      // Catalog imports run explicitly as a release step, never on every startup.
    }
    app.listen(config.port, '0.0.0.0', () => {
      // eslint-disable-next-line no-console
      console.log(`HUWA TABLE CHARM API listening on http://localhost:${config.port} (${config.env})`);
    });
  };
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Startup failed:', err);
    process.exit(1);
  });
}
