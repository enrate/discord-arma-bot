import 'dotenv/config';
import { Client, IntentsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType  } from 'discord.js';
import { TextChannel } from 'discord.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BanForms } from './discordStyle/ban';
import { ServerConfig } from './types';
import { PlayersManager } from './discordStyle/players-list';
import { StatusManager } from './discordStyle/status';

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

    private async updateStatus() {
        await StatusManager.update(
            this.discordClient,
            this.config.a2s.ip,
            this.config.a2s.port
        );
    }

    private async updatePlayerList() {
        await PlayersManager.update(
            this.discordClient,
            this.config.discord.channelId,
            this.statusMessageId,
            this.messageFile
        );
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
            try {
                if (interaction.type === InteractionType.ModalSubmit) {
                    switch (interaction.customId) {
                        case 'ban_form':
                            await BanForms.handleBanSubmit(interaction);
                            break;
                        case 'unban_form':
                            await BanForms.handleUnbanSubmit(interaction);
                            break;
                    }
                    return;
                }
    
                if (interaction.isButton()) {
                    switch (interaction.customId) {
                        case 'open_ban_form':
                            await interaction.showModal(BanForms.createBanModal());
                            break;
                        case 'open_unban_form':
                            await interaction.showModal(BanForms.createUnbanModal());
                            break;
                    }
                }
            } catch (error) {
                console.error('Ошибка обработки взаимодействия:', error);
            }
        });
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