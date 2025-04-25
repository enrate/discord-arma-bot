export interface ServerConfig {
    a2s: {
        ip: string;
        port: number;
    };
    discord: {
        token: string;
        channelId: string;
        reportsChannel: string;
    };
}

export interface ServerStats {
    connected_players: Record<string, string>;
}

export interface Player {
    number: number;
    uid: string;
    name: string;
  }