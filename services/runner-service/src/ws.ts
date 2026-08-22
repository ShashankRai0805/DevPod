import { Server, Socket } from 'socket.io';
import { fetchDir, fetchContent, updateContent } from './fs';
import { TerminalSession } from './pty';

export function initWebSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);
    let terminalSession: TerminalSession | null = null;

    // Filesystem Events
    socket.on('fetchDir', async (dirPath: string, callback: (data: any) => void) => {
      try {
        const data = await fetchDir(dirPath);
        if (callback) callback({ success: true, data });
      } catch (err: any) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    socket.on('fetchContent', async (filePath: string, callback: (data: any) => void) => {
      try {
        const content = await fetchContent(filePath);
        if (callback) callback({ success: true, content });
      } catch (err: any) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    socket.on('updateContent', async (data: any) => {
      // payload could be { path: "src/index.js", content: "..." }
      if (!data || !data.path || typeof data.content !== 'string') return;
      try {
        await updateContent(data.path, data.content);
      } catch (err) {
        console.error('Failed to update content', err);
      }
    });

    // Terminal Events
    socket.on('requestTerminal', () => {
      if (terminalSession) {
        terminalSession.kill();
      }
      
      terminalSession = new TerminalSession((data) => {
        socket.emit('terminal output', data);
      });
      console.log('Terminal session started for', socket.id);
    });

    socket.on('terminalData', (data: string) => {
      if (terminalSession) {
        terminalSession.write(data);
      }
    });

    socket.on('resizeTerminal', (data: any) => {
      if (terminalSession && data && typeof data.cols === 'number' && typeof data.rows === 'number') {
        terminalSession.resize(data.cols, data.rows);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      if (terminalSession) {
        terminalSession.kill();
      }
    });
  });
}
