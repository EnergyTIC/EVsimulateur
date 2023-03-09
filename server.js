const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const http = require('http');
const socketio = require('./src/socket');
const app = require('./src/app');

const PORT = process.env.PORT || 9002;
const server = http.createServer(app);

socketio.init(server);

server.listen(PORT, () => console.log('Simulator listening on port', PORT));
