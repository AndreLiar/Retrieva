import dotenv from 'dotenv';

dotenv.config();

/**
 * migrate-mongo configuration (ESM).
 *
 * Usage:
 *   npm run migrate:status            # show applied/pending migrations
 *   npm run migrate:up                # apply pending migrations
 *   npm run migrate:down              # roll back the last migration
 *   npm run migrate:create <name>     # scaffold a new migration
 *
 * The database is taken from MONGODB_URI. Run against each environment's URI
 * (locally via docker compose, in prod via the deploy step).
 */
const config = {
  mongodb: {
    url: process.env.MONGODB_URI || 'mongodb://localhost:27017/enterprise_rag',
    options: {},
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.js',
  // We commit migrations and trust their order; no need to hash file contents.
  useFileHash: false,
  moduleSystem: 'esm',
};

export default config;
