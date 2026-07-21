import Joi from 'joi';

export type Environment = {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'log' | 'debug' | 'verbose';
  WEB_URL: string;
  DATABASE_URL?: string;
  JWT_ACCESS_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
  S3_ENDPOINT?: string;
  S3_PUBLIC_ENDPOINT?: string;
  S3_REGION: string;
  S3_BUCKET: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_FORCE_PATH_STYLE: boolean;
};

export const environmentValidationSchema = Joi.object<Environment>({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'log', 'debug', 'verbose')
    .default('log'),
  WEB_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:5173'),
  DATABASE_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .uri({ scheme: ['postgresql', 'postgres'] })
      .required(),
    otherwise: Joi.string()
      .uri({ scheme: ['postgresql', 'postgres'] })
      .default(
        'postgresql://obsync:obsync@localhost:5432/obsync?schema=public',
      ),
  }),
  JWT_ACCESS_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string()
      .min(32)
      .default('dev-access-secret-change-before-production'),
  }),
  JWT_REFRESH_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string()
      .min(32)
      .default('dev-refresh-secret-change-before-production'),
  }),
  S3_ENDPOINT: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .optional(),
    otherwise: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .default('http://localhost:9000'),
  }),
  S3_PUBLIC_ENDPOINT: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional(),
  S3_REGION: Joi.string().min(1).default('us-east-1'),
  S3_BUCKET: Joi.string().min(3).max(63).default('obsync'),
  S3_ACCESS_KEY_ID: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(1).optional(),
    otherwise: Joi.string().min(1).default('minioadmin'),
  }),
  S3_SECRET_ACCESS_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(1).when('S3_ACCESS_KEY_ID', {
      is: Joi.exist(),
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    otherwise: Joi.string().min(1).default('minioadmin'),
  }),
  S3_FORCE_PATH_STYLE: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().truthy('true').falsy('false').default(false),
    otherwise: Joi.boolean().truthy('true').falsy('false').default(true),
  }),
}).unknown(true);
