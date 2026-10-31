import EventEmitter from "events";
import { Socket } from "net";

export enum OPCode {
  HANDSHAKE = 0,
  FRAME = 1,
  CLOSE = 2,
  PING = 3,
  PONG = 4
}

export default class IPCClient extends EventEmitter {
  private socket: Socket;
  private pending: Buffer = Buffer.alloc(0);
  private disposed = false;

  constructor() {
    super();

    this.createSocket();
  }

  private createSocket() {
    this.pending = Buffer.alloc(0);
    this.socket = new Socket();
    this.socket.on("connect", () => {
      this.emit("connect");
    });
    this.socket.on("close", (hadError: boolean) => {
      this.emit("close", hadError);
    });
    this.socket.on("error", error => {
      if (!this.disposed) this.emit("error", error);
    });
    this.socket.on("data", (buffer: Buffer) => {
      if (this.disposed) return;
      this.pending = this.pending.length ? Buffer.concat([this.pending, buffer]) : buffer;
      while (this.pending.length >= 8) {
        const op = this.pending.readUInt32LE(0);
        const length = this.pending.readUInt32LE(4);
        if (length > 1024 * 1024) {
          this.pending = Buffer.alloc(0);
          this.socket.destroy();
          this.emit("error", new Error("Discord IPC frame exceeds the size limit"));
          return;
        }
        if (this.pending.length < 8 + length) return;
        const payload = this.pending.toString("utf8", 8, 8 + length);
        this.pending = this.pending.subarray(8 + length);
        let json: unknown;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        this.emit("data", op, json);
      }
    });
  }

  public connect(ipcPath: string) {
    if (this.socket.destroyed) {
      this.createSocket();
    }
    this.socket.connect(ipcPath);
  }

  public send(data: unknown, op = OPCode.FRAME) {
    const json = JSON.stringify(data);
    const length = Buffer.byteLength(json);
    const buffer = Buffer.alloc(8 + length);
    buffer.writeInt32LE(op, 0);
    buffer.writeInt32LE(length, 4);
    buffer.write(json, 8, length);

    if (this.socket.writable && !this.socket.destroyed) {
      this.socket.write(buffer);
    }
  }

  public close() {
    if (!this.socket.closed) {
      this.send({}, OPCode.CLOSE);
      this.socket.end();
    }
  }

  public destroy() {
    this.disposed = true;
    this.removeAllListeners();
    this.pending = Buffer.alloc(0);
    this.socket.destroy();
  }
}
