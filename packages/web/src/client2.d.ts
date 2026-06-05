declare module 'client2' {
  export interface SpectatorRsPacketFrame {
    opcode: number;
    type: string;
    updateTask: boolean;
    payloadLength: number;
    payloadBase64: string;
    frameLength?: number;
    frameBase64?: string;
  }

  export class Client {
    constructor(nodeid: number, lowmem: boolean, members: boolean);
    enableSpectatorMode(): void;
    pushSpectatorPacket(frame: SpectatorRsPacketFrame): void;
    setSpectatorPosition(worldX: number, worldZ: number, level: number): boolean;
  }
}
