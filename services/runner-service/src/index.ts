import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { initWebSocket } from './ws';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

initWebSocket(io);

// Force port to 4000 to avoid conflicting with user web apps
const port = 4000;
server.listen(port, () => {
  console.log(`Runner service listening on port ${port}`);
});
