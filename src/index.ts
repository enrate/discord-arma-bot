import 'dotenv/config'; // Добавьте эту строку ПЕРВОЙ
import { Client, IntentsBitField, ActivityType, EmbedBuilder, Message } from 'discord.js';
import { FTPResponse, Client as FTPClient } from 'basic-ftp';
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PassThrough } from 'stream';
import { TextChannel } from 'discord.js';


interface FTPConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    filePath: string;
}

interface ServerStats {
    connected_players: Record<string, string>;
}

class ServerMonitorBot {
    private discordClient: Client;
    private ftpConfig: FTPConfig;
    private channelId: string;
    private statusMessageId: string | null = null;
    private readonly messageFile = process.env.local ? join(__dirname, 'last_message.txt') : '/app/data/last_message.txt';

    constructor() {
        this.discordClient = new Client({
            intents: [
                IntentsBitField.Flags.Guilds,
                IntentsBitField.Flags.GuildMessages
            ]
        });

        this.ftpConfig = {
            host: process.env.FTP_HOST!,
            port: parseInt(process.env.FTP_PORT || '21'),
            user: process.env.FTP_USER!,
            password: process.env.FTP_PASSWORD!,
            filePath: '/profiles/ArmaReforgerServer/profile/ServerAdminTools_Stats.json'
        };

        this.channelId = process.env.CHANNEL_ID!;
        this.loadLastMessageId();
    }

    private loadLastMessageId(): void {
        try {
            if (existsSync(this.messageFile)) {
                this.statusMessageId = readFileSync(this.messageFile, 'utf-8');
            }
        } catch (error) {
            console.error('Error loading message ID:', error);
        }
    }

    private saveLastMessageId(messageId: string): void {
        try {
            writeFileSync(this.messageFile, messageId);
            this.statusMessageId = messageId;
        } catch (error) {
            console.error('Error saving message ID:', error);
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
    
    private async getPlayersFromFTP(): Promise<string[] | null> {
        const client = new FTPClient();
            // Настройка таймаутов и параметров
    // client.ftp.verbose = true; // Включить детальное логирование
    client.ftp.tlsOptions = {
        timeout: 30_000,
        rejectUnauthorized: false, // Отключает проверку сертификата
        checkServerIdentity: () => undefined
    };
        try {
            // Подключаемся с конфигурацией
            await client.access({
                host: this.ftpConfig.host,
                user: this.ftpConfig.user,
                password: this.ftpConfig.password,
                port: this.ftpConfig.port,
                secure: false,
                secureOptions: {
                    timeout: 30_000
                }
            });
    
            // Создаем поток для записи данных
            const bufferStream = new PassThrough();
            
            // Исправляем название метода (downloadTo вместо downloadToStream)
            await client.downloadTo(bufferStream, this.ftpConfig.filePath);
            
            // Собираем данные через Buffer
            const chunks: Buffer[] = [];
            for await (const chunk of bufferStream) {
                chunks.push(chunk);
            }
            // await downloadPromise; // Дожидаемся завершения загрузки
    
            const data = Buffer.concat(chunks).toString();
            const stats: ServerStats = JSON.parse(data);
            
            return Object.values(stats.connected_players);
            
        } catch (error) {
            console.error('FTP Operation Failed:', error instanceof Error ? error.message : error);
            return null;
        } finally {
            await this.safeCloseClient(client);
        }
    }

    private formatPlayers(players: string[] | null): string {
        if (!players || players.length === 0) {
            return 'Сейчас никого нет на сервере';
        }

        const playerList = players.map(p => `• ${p}`).join('\n');
        return playerList.length > 4096 
            ? 'Слишком много игроков для отображения' 
            : playerList;
    }

    private async getOrCreateMessage(): Promise<Message | null> {
        const channel = await this.discordClient.channels.fetch(this.channelId) as TextChannel;
        if (!channel?.isTextBased()) return null;

        try {
            if (this.statusMessageId) {
                return await channel.messages.fetch(this.statusMessageId);
            }
        } catch (error) {
            console.log('Message not found, creating new one');
        }

        const message = await channel.send('Инициализация...');
        
        this.saveLastMessageId(message.id);
        return message;
    }

    private startUpdateTasks(): void {
        // Обновление списка игроков
        setInterval(async () => {
            try{
                const data = await this.getPlayersFromFTP(); 
            try {
                const message = await this.getOrCreateMessage();
                if (!message) return;

                const embed = new EmbedBuilder()
                    .setTitle(`Игроки онлайн (${data?.length || 0}/128)`)
                    .setDescription(this.formatPlayers(data))
                    .setColor(0x00FF00);

                await message.edit({ content: null, embeds: [embed] });
            } catch (error) {
                console.error('Update error:', error);
            }
            try {
                const count = data?.length || 0;

                this.discordClient.user?.setActivity({
                    name: `${count}/128 | server 1 (1pp)`,
                    type: ActivityType.Playing
                });
            } catch (error) {
                console.error('Status update error:', error);
            }
        } catch(error) {
            console.error('get data from ftp error:', error);
        }
        }, 120_000);
    }

    public async start(): Promise<void> {
        this.discordClient.once('ready', () => {
            console.log(`Бот ${this.discordClient.user?.tag} готов к работе!`);
            this.startUpdateTasks();
        });

        await this.discordClient.login(process.env.DISCORD_TOKEN);
    }
}

// Запуск бота
new ServerMonitorBot().start();