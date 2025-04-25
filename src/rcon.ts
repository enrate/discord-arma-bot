import * as readline from 'readline';
import { readCfg, Socket } from '@senfo/battleye';
import { parsePlayersData } from './helper';
import { Player } from './types';

export class Rcon {
    private socket: Socket;
    private connection: any;
    private rl: readline.Interface;

    constructor(config: {
        name: string;
        password: string;
        ip: string;
        port: number;
    }) {
        // Инициализация сокета
        this.socket = new Socket();

        // Создание подключения
        this.connection = this.socket.connection({
            name: config.name,
            password: config.password,
            ip: config.ip,
            port: config.port
        }, {
            reconnect: true,
            reconnectTimeout: 500,
            keepAlive: true,
            keepAliveInterval: 15000,
            timeout: true,
            timeoutInterval: 1000,
            serverTimeout: 30000,
            packetTimeout: 1000,
            packetTimeoutThresholded: 5,
        });

        // Инициализация readline
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // Настройка обработчиков событий
        this.setupEventHandlers();
    }

    private setupEventHandlers() {
        this.socket.on('listening', (socket: any) => {
            const addr = socket.address();
            console.log(`Socket listening on ${typeof addr === 'string' ? addr : `${addr.address}:${addr.port}`}`);
        });

        this.socket.on('error', (err: any) => {
            console.error(`SOCKET ERROR:`, err);
        });

        this.connection.on('message', (message: any, packet: any) => {
            console.log(`message: ${this.connection.ip}:${this.connection.port} => message: ${message}`);
        });

        this.connection.on('disconnected', (reason: any) => {
            console.warn(`disconnected from ${this.connection.ip}:${this.connection.port},`, reason);
        });

        this.connection.on('connected', () => {
            console.log(`connected to ${this.connection.ip}:${this.connection.port}`);
        });

        this.rl.on('line', (input: string) => {
            this.connection.command(input)
                .then((response: any) => {
                    console.log(`response: ${this.connection.ip}:${this.connection.port} => ${response.command}\n${response.data}`);
                })
                .catch(console.error);
        });
    }

    // Метод для ручного подключения
    public connect() {
        return new Promise((resolve, reject) => {
            this.connection.once('connected', resolve);
            this.connection.once('error', reject);
        });
    }

    // Метод для отправки команд
    public sendCommand(command: string): Promise<any> {
        return this.connection.command(command);
    }

    // Метод для закрытия соединения
    public disconnect() {
        this.rl.close();
        return this.connection.disconnect();
    }

    public async getPlayers(): Promise<Array<Player>> {
        const players = await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Timeout getting players'));
            }, 15000);
    
            const handler = (message: string) => {
                if (message.startsWith('Players on server')) {
                    clearTimeout(timer);
                    this.connection.off('message', handler);
                    resolve(message);
                }
            };
    
            this.connection.on('message', handler);
            this.sendCommand("#players").catch(reject);
        });
        return parsePlayersData(players)
    }
    public async kickPlayer(playerId:number) {
        await this.sendCommand(`#kick ${playerId}`)
    }
    public async banPlayer(playerUID: string, timeInHours: number, reason: string) {
        const expectedMessage = `Player '${playerUID}' banned!`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Timeout ban player'));
            }, 15000);
    
            const handler = (message: string) => {
                if (message.includes(expectedMessage)) {
                    clearTimeout(timer);
                    this.connection.off('message', handler);
                    resolve(message);
                }
            };
    
            this.connection.on('message', handler);
            this.sendCommand(`#ban create ${playerUID} ${timeInHours*3600} ${reason}`).catch(reject);
        }).then(async () => {
        const scopePlayer = (await rconClient.getPlayers()).find((player) => player.uid === playerUID)
        if(scopePlayer) {
            await rconClient.kickPlayer(scopePlayer.number)
        }
        });
    }
    public async unBanPlayer(playerUID: string) {
        const expectedMessage = `Ban removed!`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Timeout unban player'));
            }, 15000);
    
            const handler = (message: string) => {
                if (message.includes(expectedMessage)) {
                    clearTimeout(timer);
                    this.connection.off('message', handler);
                    resolve(message);
                }
            };
    
            this.connection.on('message', handler);
            this.sendCommand(`#ban remove ${playerUID}`).catch(reject);
        });
    }
}

// Пример использования
export const rconClient = new Rcon({
    name: 'server1',
    password: process.env.RCON_PASSWORD!,
    ip: process.env.SERVER_IP!,
    port: Number(process.env.RCON_PORT)!
});