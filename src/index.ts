import 'dotenv/config';
import { Client, IntentsBitField, ActivityType, EmbedBuilder, Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ModalSubmitInteraction, InteractionType  } from 'discord.js';
import { Client as FTPClient } from 'basic-ftp';
import { PassThrough } from 'stream';
import { TextChannel } from 'discord.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import nodea2s from 'node-a2s';
import * as readline from 'readline'
import { readCfg, Socket } from '@senfo/battleye'

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
        reportsChannel: string;
    };
}
 // create socket
 const socket = new Socket()

  // create connection
  const connection = socket.connection({
    name: 'my-server',                // server name
    password: 'sxJhPSk6EMrQKFqj',       // rcon password
    ip: '195.18.27.162',                   // rcon ip
    port: 2004                // rcon port
  }, {
    reconnect: true,              // reconnect on timeout
    reconnectTimeout: 500,        // how long (in ms) to try reconnect
    keepAlive: true,              // send keepAlive packet
    keepAliveInterval: 15000,     // keepAlive packet interval (in ms)
    timeout: true,                // timeout packets
    timeoutInterval: 1000,        // interval to check packets (in ms)
    serverTimeout: 30000,         // timeout server connection (in ms)
    packetTimeout: 1000,          // timeout packet check interval (in ms)
    packetTimeoutThresholded: 5,  // packets to resend
  })
  // create readline for command input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  socket.on('listening', (socket: { address: () => any; }) => {
    const addr = socket.address()
    // console.log(`Socket listening on ${typeof addr === 'string' ? addr : `${addr.address}:${addr.port}`}`)
  })

  socket.on('received', (resolved: any, packet: any, buffer: any, connection: { ip: any; port: any; }, info: any) => {
    // console.log(`received: ${connection.ip}:${connection.port} => packet:`, packet)
  })

  socket.on('sent', (packet: any, buffer: any, bytes: any, connection: { ip: any; port: any; }) => {
    // console.log(`sent: ${connection.ip}:${connection.port} => packet:`, packet)
  })

  socket.on('error', (err: any) => { console.error(`SOCKET ERROR:`, err) })

  connection.on('message', (message: any, packet: any) => {
    console.log(`message: ${connection.ip}:${connection.port} => message: ${message}`)
  })

  connection.on('command', (data: any, resolved: any, packet: any) => {
    // console.log(`command: ${connection.ip}:${connection.port} => packet:`, packet)
  })

  connection.on('disconnected', (reason: any) => {
    // console.warn(`disconnected from ${connection.ip}:${connection.port},`, reason)
  })

  connection.on('connected', () => {
    // console.error(`connected to ${connection.ip}:${connection.port}`)
  })

//   connection.on('debug', console.log)

  connection.on('error', (err: any) => {
    // console.error(`CONNECTION ERROR:`, err)
  })

  rl.on('line', input => {
    connection
      .command(input)
      .then((response) => {
        // console.log(`response: ${connection.ip}:${connection.port} => ${response.command}\n${response.data}`)
      })
      .catch(console.error)

    console.log(`send: ${connection.ip}:${connection.port} => ${input}`)
  })


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
            intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages]
            
        });
        this.loadMessageId();
    }
    
    public async start() {
        await this.initDiscord();
        await this.sendInputForm(); // Добавляем отправку формы при инициализацииs
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
    
                await message.edit({ content: '', embeds: [embed] });
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

    private originalFormComponents: ActionRowBuilder<any>[] = [];

    private async sendInputForm() {
        try {
            const channel = await this.discordClient.channels.fetch('1365138437795090534') as TextChannel;
            if (!channel) return;

            const actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents([
                    new ButtonBuilder()
                        .setCustomId('open_ban_form')
                        .setLabel('Выдать бан')
                        .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                        .setCustomId('open_unban_form')
                        .setLabel('Снять бан')
                        .setStyle(ButtonStyle.Primary)
                ]
                );

                this.originalFormComponents = [actionRow];

            await channel.send({
                content: '**Система банов**',
                components: this.originalFormComponents 
            });

            this.setupFormHandlers();
        } catch (error) {
            console.error('Ошибка отправки формы:', error);
        }
    }

    private setupFormHandlers() {
        this.discordClient.on('interactionCreate', async interaction => {
            try{
                if(interaction.type === InteractionType.ModalSubmit) {
                    await this.handleFormSubmission(interaction as ModalSubmitInteraction);
                    return;
                }
                if(interaction.isButton()) {
                    if (interaction.customId === 'open_ban_form') {
                        // Создаем модальное окно
                        const modal = new ModalBuilder()
                            .setCustomId('ban_form')
                            .setTitle('Выдать бан');
            
                        // Определяем поля ввода
                        const inputs = [
                            new TextInputBuilder()
                                .setCustomId('ban_id')
                                .setLabel("ID")
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('ab6b9fa2-9ed8-434a-a2b6-bce11743372a')
                                .setRequired(true),
                            
                            new TextInputBuilder()
                                .setCustomId('ban_time')
                                .setLabel("Время (часы)")
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('1, 2, 3, 5, 24, 48, 168')
                                .setRequired(true),
                            
                            new TextInputBuilder()
                                .setCustomId('ban_reason')
                                .setLabel("Причина")
                                .setStyle(TextInputStyle.Paragraph)
                                .setPlaceholder('bad boy')
                                .setRequired(true)
                        ];
            
                        // Создаем Action Row для каждого поля
                        const actionRows = inputs.map(input => 
                            new ActionRowBuilder<TextInputBuilder>().addComponents(input)
                        );
            
                        // Добавляем компоненты в модальное окно
                        modal.addComponents(...actionRows);
            
                        // Показываем модальное окно пользователю
                        await interaction.showModal(modal);
                    }
                    if (interaction.customId === 'open_unban_form') {
                        // Создаем модальное окно
                        const modal = new ModalBuilder()
                            .setCustomId('unban_form')
                            .setTitle('Снять бан');
            
                        // Определяем поля ввода
                        const inputs = [
                            new TextInputBuilder()
                                .setCustomId('unban_id')
                                .setLabel("ID")
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('ab6b9fa2-9ed8-434a-a2b6-bce11743372a')
                                .setRequired(true),
                            new TextInputBuilder()
                                .setCustomId('unban_reason')
                                .setLabel("Причина")
                                .setStyle(TextInputStyle.Paragraph)
                                .setPlaceholder('Хороший мальчик')
                                .setRequired(true)
                        ];
            
                        // Создаем Action Row для каждого поля
                        const actionRows = inputs.map(input => 
                            new ActionRowBuilder<TextInputBuilder>().addComponents(input)
                        );
            
                        // Добавляем компоненты в модальное окно
                        modal.addComponents(...actionRows);
            
                        // Показываем модальное окно пользователю
                        await interaction.showModal(modal);
                    }
                }
            } catch (error) {
                console.error('Ошибка обработки взаимодействия:', error);
            }
    
        });
    }

    private async handleFormSubmission(interaction: ModalSubmitInteraction) {        
        if (interaction.customId === 'ban_form') {
            try {
            const ban_id = interaction.fields.getTextInputValue('ban_id');
            const ban_time = interaction.fields.getTextInputValue('ban_time');
            const ban_reason = interaction.fields.getTextInputValue('ban_reason');

            // Обработка данных
            console.log('Получены данные:', { ban_id, ban_time, ban_reason });

            const timeNumber = parseInt(ban_time);
            if (isNaN(timeNumber)) {
                await interaction.reply({
                    content: '❌ Время бана должно быть числом!',
                    ephemeral: true
                });
                return;
            }

            await connection.command(`#ban create ${ban_id} ${Number(ban_time)*3600} ${ban_reason}`)
            .then(async() => {
                const expectedMessage = `Player '${ban_id}' banned!`;
        
        const banConfirmation = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Не получено подтверждение бана'));
            }, 15000);

            const messageHandler = (message: string) => {
                if (message.includes(expectedMessage)) {
                    clearTimeout(timeout);
                    connection.off('message', messageHandler);
                    resolve();
                }
            };

            connection.on('message', messageHandler);
        });

        await banConfirmation;

              await interaction.reply({ 
                  content: '✅ Успешно!',
                  components: [],
                  ephemeral: true
              });
            })
            .catch(async (error) => {
                console.error('Ошибка бана:', error);
                await interaction.reply({
                    content: `❌ Ошибка бана: ${error.message}`,
                    ephemeral: true
                });
                return
            });
            


            // Отправка в нужный канал
            const targetChannel = await this.discordClient.channels.fetch(process.env.REPORTS_CHANNEL!) as TextChannel;
            if (targetChannel?.isTextBased()) {
                await targetChannel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('Блокировка')
                        .setAuthor({
                            name: interaction.user.tag,
                            iconURL: interaction.user.displayAvatarURL()
                        })
                        .addFields(
                            { name: 'ID игрока', value: ban_id },
                            { name: 'Время', value: `${ban_time} часов` },
                            { name: 'Причина', value: ban_reason }
                        )
                        .setColor(0x00ff00)
                    ]
                });
            }

            // Задержка 3 секунды
        await new Promise(resolve => setTimeout(resolve, 3000));

        await interaction.deleteReply()
    } catch (error) {
        console.error('Ошибка отправки формы:', error);
    }
        }
        if (interaction.customId === 'unban_form') {
            try {
            const unban_id = interaction.fields.getTextInputValue('unban_id');
            const unban_reason = interaction.fields.getTextInputValue('unban_reason');

            // Обработка данных
            console.log('Получены данные:', { unban_id, unban_reason });
            
            await connection.command(`#ban remove ${unban_id}`)
            .then(async() => {

                const expectedMessage = `Ban removed!`;
        
        const unbanConfirmation = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Не получено подтверждение разбана'));
            }, 15000);

            const messageHandler = (message: string) => {
                if (message.includes(expectedMessage)) {
                    clearTimeout(timeout);
                    connection.off('message', messageHandler);
                    resolve();
                }
            };

            connection.on('message', messageHandler);
        });

        await unbanConfirmation;

              await interaction.reply({ 
                  content: '✅ Успешно!',
                  components: [],
                  ephemeral: true
              });
            })
            .catch(async (error) => {
                console.error('Ошибка cнятия бана:', error);
                await interaction.reply({
                    content: `❌ Ошибка cнятия бана: ${error.message}`,
                    ephemeral: true
                });
                return
            });


            // Отправка в нужный канал
            const targetChannel = await this.discordClient.channels.fetch(process.env.REPORTS_CHANNEL!) as TextChannel;
            if (targetChannel?.isTextBased()) {
                await targetChannel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('Снятие блокировки')
                        .setAuthor({
                            name: interaction.user.tag,
                            iconURL: interaction.user.displayAvatarURL()
                        })
                        .addFields(
                            { name: 'ID игрока', value: unban_id },
                            { name: 'Причина', value: unban_reason }
                        )
                        .setColor(0x00ff00)
                    ]
                });
            }

            // Задержка 3 секунды
        await new Promise(resolve => setTimeout(resolve, 3000));

        await interaction.deleteReply()
    } catch (error) {
        console.error('Ошибка отправки формы:', error);
    }
        }
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
        channelId: process.env.CHANNEL_ID!,
        reportsChannel: process.env.REPORTS_CHANNEL!
    }
};

// Запуск бота
new ArmaBot(config).start();