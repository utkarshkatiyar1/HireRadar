const IORedis = require('ioredis');

// Single shared ioredis connection, per BullMQ's recommended pattern
// (BullMQ requires maxRetriesPerRequest: null on the connection it manages).
let connection;

const getConnection = () => {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
};

module.exports = { getConnection };
