const IORedis = require('ioredis');

// Single shared ioredis connection, per BullMQ's recommended pattern
// (BullMQ requires maxRetriesPerRequest: null on the connection it manages).
let connection;

const getConnection = () => {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    connection.on('connect', () => console.log('[redis] connected'));
    connection.on('ready', () => console.log('[redis] ready'));
    connection.on('error', (err) => console.error('[redis] connection error:', err.message));
    connection.on('close', () => console.warn('[redis] connection closed'));
  }
  return connection;
};

module.exports = { getConnection };
