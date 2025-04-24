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
    private readonly messageFile = join(__dirname, 'last_message.txt');

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

    private async getPlayersFromFTP(): Promise<string[] | null> {
        const client = new FTPClient();
        const bufferStream = new PassThrough();
    let data = Buffer.from('');

        try {
            await client.access({
                host: this.ftpConfig.host,
                port: this.ftpConfig.port,
                user: this.ftpConfig.user,
                password: this.ftpConfig.password,
                secure: false
            });

       // Собираем данные через stream
       await client.downloadTo(bufferStream, this.ftpConfig.filePath);
        
       // Обрабатываем поток данных
       return new Promise((resolve, reject) => {
           bufferStream.on('data', (chunk: Buffer) => {
               data = Buffer.concat([data, chunk]);
           });
           
           bufferStream.on('end', () => {
               const stats: ServerStats = JSON.parse(data.toString());
               resolve(Object.values(stats.connected_players));
           });
           
           bufferStream.on('error', reject);
       });
       
   } catch (error) {
       console.error('FTP Error:', error);
       return null;
   } finally {
       client.close();
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
            try {
                const message = await this.getOrCreateMessage();
                if (!message) return;

                const players = await this.getPlayersFromFTP();
                const embed = new EmbedBuilder()
                    .setTitle(`Игроки онлайн (${players?.length || 0}/128)`)
                    .setDescription(this.formatPlayers(players))
                    .setColor(0x00FF00);

                await message.edit({ embeds: [embed] });
            } catch (error) {
                console.error('Update error:', error);
            }
        }, 120_000);

        // Обновление статуса
        setInterval(async () => {
            try {
                const players = await this.getPlayersFromFTP();
                const count = players?.length || 0;

                this.discordClient.user?.setActivity({
                    name: `${count}/128 | server 1 (1pp)`,
                    type: ActivityType.Playing
                });
            } catch (error) {
                console.error('Status update error:', error);
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