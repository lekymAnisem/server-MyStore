const http = require('http');
const app = require('./app');
const config = require('./config');
const { setupSocket } = require('./sockets');

const server = http.createServer(app);

setupSocket(server);

server.listen(config.port, () => {
  console.log(`Server running in ${config.nodeEnv} mode on port ${config.port}`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  process.exit(1);
});
