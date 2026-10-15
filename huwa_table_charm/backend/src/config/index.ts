import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DB_DRIVER: z.enum(['postgres', 'sqlite']).optional(),
  DB_PATH: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  STATIC_DIR: z.string().optional(),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('huwa_table_charm'),
  DB_USER: z.string().default('huwa'),
  DB_PASSWORD: z.string().default('huwa_secret'),
  JWT_SECRET: z.string().default('huwa-dev-jwt-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().default('huwa-dev-refresh-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

if(parsed.data.NODE_ENV==='production'){for(const key of ['JWT_SECRET','JWT_REFRESH_SECRET'] as const){const value=process.env[key];if(!value||value.length<32||/change-me|huwa-dev/.test(value))throw new Error(key+' must be a unique production secret of at least 32 characters');}if(process.env.JWT_SECRET===process.env.JWT_REFRESH_SECRET)throw new Error('Production JWT secrets must differ');}
export const config = {
  env: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  dbDriver: parsed.data.DB_DRIVER,
  dbPath: parsed.data.DB_PATH,
  staticDir: parsed.data.STATIC_DIR,
  db: {
    url: parsed.data.DATABASE_URL,
    host: parsed.data.DB_HOST,
    port: parsed.data.DB_PORT,
    name: parsed.data.DB_NAME,
    user: parsed.data.DB_USER,
    password: parsed.data.DB_PASSWORD,
  },
  jwt: {
    secret: parsed.data.JWT_SECRET,
    refreshSecret: parsed.data.JWT_REFRESH_SECRET,
    expiresIn: parsed.data.JWT_EXPIRES_IN,
    refreshExpiresIn: parsed.data.JWT_REFRESH_EXPIRES_IN,
  },
  stripe: {
    secretKey: parsed.data.STRIPE_SECRET_KEY,
    webhookSecret: parsed.data.STRIPE_WEBHOOK_SECRET,
  },
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
  llm: {
    apiKey: parsed.data.LLM_API_KEY,
    model: parsed.data.LLM_MODEL,
  },
} as const;

export default config;
