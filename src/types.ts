export interface ServerConfig {
    ftp: {
        host: string;
        port: number;
        user: string;
        password: string;
        filePath: string;
    };
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