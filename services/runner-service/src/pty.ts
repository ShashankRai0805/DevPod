import * as pty from 'node-pty';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';

export class TerminalSession {
  private ptyProcess: pty.IPty;
  
  constructor(onData: (data: string) => void) {
    const shell = process.env.SHELL || '/bin/sh'; // Changed from bash to sh to be safe with alpine/slim

    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: WORKSPACE_DIR,
      env: process.env as any
    });

    this.ptyProcess.onData((data) => {
      onData(data);
    });
  }

  write(data: string) {
    this.ptyProcess.write(data);
  }

  resize(cols: number, rows: number) {
    try {
      this.ptyProcess.resize(cols, rows);
    } catch (e) {
      console.warn("Resize failed", e);
    }
  }

  kill() {
    this.ptyProcess.kill();
  }
}
