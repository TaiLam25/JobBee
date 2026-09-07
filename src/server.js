const dotenv = require('dotenv');
dotenv.config();

const app = require('./app');
const { pool } = require('./config/db');
const { logger } = require('./config/logger');

const { startAutoApproveJob, stopAutoApproveJob } = require('./modules/admin/auto_approve.service');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    // Initialize Auto-Approve Demo Background Worker
    startAutoApproveJob();
});

// Requirement 11: Graceful Shutdown
const gracefulShutdown = (signal) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    stopAutoApproveJob();
    server.close(async () => {
        logger.info('HTTP server closed.');
        try {
            await pool.end();
            logger.info('PostgreSQL connection pool closed.');
            process.exit(0);
        } catch (err) {
            logger.error('Error during database pool shutdown:', err);
            process.exit(1);
        }
    });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
