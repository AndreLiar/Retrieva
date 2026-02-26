import logger from '../config/logger.js';

/**
 * Startup Initialization Service
 */
export class StartupInitService {
  async initialize() {
    logger.info('Startup initialization complete');
  }
}

export const startupInitService = new StartupInitService();
export default startupInitService;
