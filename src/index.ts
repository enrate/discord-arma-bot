import 'dotenv/config';
import { Client, IntentsBitField, ActivityType, EmbedBuilder, Message  } from 'discord.js';
import { Client as FTPClient } from 'basic-ftp';
import { PassThrough } from 'stream';
import { TextChannel } from 'discord.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import nodea2s from 'node-a2s';

interface ServerConfig {
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
    };
}

interface ServerStats {
    connected_players: Record<string, string>;
}

class ArmaBot {
    private discordClient: Client;
    private config: ServerConfig;
    private statusMessageId: string | null = null;
    private readonly messageFile = join(__dirname,'../data', 'last_message.txt');

    constructor(config: ServerConfig) {
        this.config = config;
        this.discordClient = new Client({
            intents: [IntentsBitField.Flags.GuildMessages]
        });
        this.loadMessageId();
    }

    public async start() {
        await this.initDiscord();
        this.startUpdateLoop();
    }

    private async initDiscord() {
        await this.discordClient.login(this.config.discord.token);
        console.log(`Logged in as ${this.discordClient.user?.tag}`);
    }

    

    private async getA2SInfo() {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
        try {
        console.log = () => {};
        console.error = () => {};
    
            const serverInfo = await nodea2s.info(`${this.config.a2s.ip}:${this.config.a2s.port}`);
            return serverInfo
        } catch (error) {
            console.error('A2S Error:', error);
            return { players: 0, maxPlayers: 0 };
        } finally {
            console.log = originalConsoleLog;
            console.error = originalConsoleError;
        }
    }

    private async safeCloseClient(client: FTPClient): Promise<void> {
        try {
            if (!client.closed) { // Проверяем состояние соединения
                await client.close();
            }
        } catch (closeError) {
            console.error('Failed to close FTP connection:', closeError);
        }
    }

    private async getFTPPlayers(): Promise<string[] | null> {
        const client = new FTPClient();
        
        // Настройки для улучшения стабильности соединения
        client.ftp.encoding = 'binary';
    
        try {
            // Подключение с повторными попытками
            await this.connectWithRetry(client, 3);
            
            // Загрузка файла с обработкой потока
            const data = await this.downloadFileWithRetry(client);
            
            const stats: ServerStats = JSON.parse(data);
            return Object.values(stats.connected_players);
            
        } catch (error) {
            console.error('FTP Error:', this.formatFtpError(error));
            return null;
        } finally {
            await this.safeCloseClient(client);
        }
    }
    
    private async connectWithRetry(client: FTPClient, attempts: number): Promise<void> {
        for (let i = 1; i <= attempts; i++) {
            try {
                await client.access({
                    host: this.config.ftp.host,
                    port: this.config.ftp.port,
                    user: this.config.ftp.user,
                    password: this.config.ftp.password,
                    secure: true,
                    secureOptions: {
                        rejectUnauthorized: false,
                        sessionTimeout: 45000
                    }
                });
                return;
            } catch (error) {
                if (i === attempts) throw error;
                await this.delay(5000 * i);
            }
        }
    }
    
    private async downloadFileWithRetry(client: FTPClient): Promise<string> {
        const bufferStream = new PassThrough();
        let chunks: Buffer[] = [];
        
        try {
            const downloadPromise = client.downloadTo(bufferStream, this.config.ftp.filePath);
            
            // Собираем данные через событие 'data'
            bufferStream.on('data', (chunk) => chunks.push(chunk));
            
            // Ожидаем завершение загрузки
            await Promise.race([
                downloadPromise,
                this.timeout(60000)
            ]);
            
            // Проверяем наличие данных
            if (chunks.length === 0) {
                throw new Error('No data received');
            }
            
            return Buffer.concat(chunks).toString();
            
        } catch (error) {
            // Повторная попытка при обрыве соединения
            if (this.isConnectionError(error)) {
                chunks = [];
                return this.downloadFileWithRetry(client);
            }
            throw error;
        }
    }
    
    // Вспомогательные методы
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    private timeout(ms: number): Promise<never> {
        return new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Operation timeout')), ms));
    }
    
    private isConnectionError(error: unknown): boolean {
        return error instanceof Error && (
            error.message.includes('ECONNRESET') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('Timeout')
        );
    }
    
    private formatFtpError(error: unknown): string {
        if (!(error instanceof Error)) return 'Unknown error';
        
        return `[${new Date().toISOString()}] FTP Error: ${error.message}\n${
            error.stack?.replace('Error: ', '') || 'No stack trace'
        }`;
    }
    
        private loadMessageId() {
            try {
                if (existsSync(this.messageFile)) {
                    this.statusMessageId = readFileSync(this.messageFile, 'utf-8');
                }
            } catch (error) {
                console.error('Error loading message ID:', error);
            }
        }
    
        private saveMessageId(messageId: string) {
            try {
                writeFileSync(this.messageFile, messageId);
                this.statusMessageId = messageId;
            } catch (error) {
                console.error('Error saving message ID:', error);
            }
        }
    
        private async getOrCreateMessage(channel: TextChannel): Promise<Message | null> {
            if (!this.statusMessageId) {
                const message = await channel.send('Инициализация...');
                this.saveMessageId(message.id);
                return message;
            }
    
            try {
                return await channel.messages.fetch(this.statusMessageId);
            } catch (error) {
                console.log('Message not found, creating new one');
                const message = await channel.send('Инициализация...');
                this.saveMessageId(message.id);
                return message;
            }
        }
    
        private async updateStatus() {
            try {
                const a2sInfo = await this.getA2SInfo();
                await Promise.all([
                    this.discordClient.user?.setActivity({
                    name: `${a2sInfo.players}/${a2sInfo.maxPlayers} | Server 1 (1pp)`,
                    type: ActivityType.Playing
                })]
            )
            } catch (e) {
                console.error('Status update error:', e);
            }
        }
    
        private async updatePlayerList() {
            try {
                const channel = await this.discordClient.channels.fetch(
                    this.config.discord.channelId
                ) as TextChannel;
    
                if (!channel) return;
    
                const message = await this.getOrCreateMessage(channel);
                if (!message) return;
    
                const players = await this.getFTPPlayers();
                const embed = new EmbedBuilder()
                    .setTitle('Игроки онлайн')
                    .setDescription(players?.join('\n') || 'Сейчас никого нет')
                    .setColor(0x00FF00);
    
                await message.edit({ embeds: [embed] });
            } catch (e) {
                console.error('Player list update error:', e);
            }
        }

    private startUpdateLoop() {
        // Обновление статуса каждую минуту
        setInterval(() => this.updateStatus(), 60_000);
        
        // Обновление списка игроков каждые 2 минуты
        setInterval(() => this.updatePlayerList(), 120_000);
        
        Promise.all([
            this.updateStatus(),
            this.updatePlayerList()
        ]).catch(console.error);
    }
}

// Конфигурация
const config: ServerConfig = {
    ftp: {
        host: process.env.FTP_HOST!,
        port: parseInt(process.env.FTP_PORT || '21'),
        user: process.env.FTP_USER!,
        password: process.env.FTP_PASSWORD!,
        filePath: '/profiles/ArmaReforgerServer/profile/ServerAdminTools_Stats.json'
    },
    a2s: {
        ip: process.env.SERVER_IP!,
        port: parseInt(process.env.SERVER_PORT || '2005')
    },
    discord: {
        token: process.env.DISCORD_TOKEN!,
        channelId: process.env.CHANNEL_ID!
    }
};

// Запуск бота
new ArmaBot(config).start();