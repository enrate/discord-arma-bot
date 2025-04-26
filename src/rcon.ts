import * as readline from 'readline';
import { readCfg, Socket } from '@senfo/battleye';
import { isUUIDv4, parsePlayersData } from './helper';
import { Player } from './types';
import dayjs from 'dayjs';
import { pool } from './db';
import { RowDataPacket } from 'mysql2';

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
            console.log(`[${dayjs().format('DD.MM.YYYY (HH:mm:ss)')}] message: ${this.connection.ip}:${this.connection.port} => message: ${message}`);
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
    public async banPlayer(playerUID: string, timeInHours: number, reason: string): Promise<{uid: string, name: string}> {
        let targetPlayer = playerUID;
        if (!isUUIDv4(targetPlayer)) {
            const connection = await pool.getConnection();
            try {
                const [connectionRows] = await connection.query<RowDataPacket[]>(
                    `SELECT player_id 
                    FROM player_connections 
                    WHERE player_name = ? 
                    ORDER BY timestamp_last_connection DESC 
                    LIMIT 1`,
                    [targetPlayer]
                );
                
                if (connectionRows.length === 0) {
                    throw new Error('Игрок не найден в истории подключений');
                }
                targetPlayer = connectionRows[0].player_id;
            } catch (error) {
                throw new Error("Ошбка при поиске UID игрока по имени в БД")
            }
        }

        const expectedMessage = `Player '${targetPlayer}' banned!`;
        await new Promise((resolve, reject) => {
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
            this.sendCommand(`#ban create ${!isUUIDv4(playerUID) ? targetPlayer : playerUID} ${timeInHours*3600} ${reason}`).catch(reject);
        }).then(async () => {
        const scopePlayer = (await rconClient.getPlayers()).find((player) => player.uid === playerUID)
        if(scopePlayer) {
            await rconClient.kickPlayer(scopePlayer.number)
        }
        });
        return {uid: targetPlayer, name: playerUID}
    }
    public async unBanPlayer(playerUID: string): Promise<{uid: string, name: string}> {
        let targetPlayer = playerUID;
        if (!isUUIDv4(targetPlayer)) {
            const connection = await pool.getConnection();
            try {
                const [connectionRows] = await connection.query<RowDataPacket[]>(
                    `SELECT player_id 
                    FROM player_connections 
                    WHERE player_name = ? 
                    ORDER BY timestamp_last_connection DESC 
                    LIMIT 1`,
                    [targetPlayer]
                );
                
                if (connectionRows.length === 0) {
                    throw new Error('Игрок не найден в истории подключений');
                }
                targetPlayer = connectionRows[0].player_id;
            } catch (error) {
                throw new Error("Ошбка при поиске UID игрока по имени в БД")
            }
        }

        const expectedMessage = `Ban removed!`;
        await new Promise((resolve, reject) => {
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
            this.sendCommand(`#ban remove ${!isUUIDv4(playerUID) ? targetPlayer : playerUID}`).catch(reject);
        });
        return {uid: targetPlayer, name: playerUID}
    }
}

// Пример использования
export const rconClient = new Rcon({
    name: 'server1',
    password: process.env.RCON_PASSWORD!,
    ip: process.env.SERVER_IP!,
    port: Number(process.env.RCON_PORT)!
});