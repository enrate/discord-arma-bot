import 'dotenv/config';
import { Client, Message, IntentsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType, ComponentType, PermissionFlagsBits  } from 'discord.js';
import { TextChannel } from 'discord.js';
import { BanForms } from './discordStyle/ban';
import { ServerConfig } from './types';
import { PlayersManager } from './discordStyle/players-list';
import { StatusManager } from './discordStyle/status';
import { PlayersStats } from './discordStyle/player-stats';
import { pool } from './db';


class ArmaBot {
    private discordClient: Client;
    private config: ServerConfig;

    constructor(config: ServerConfig) {
        this.config = config;
        this.discordClient = new Client({
            intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages]
            
        });
    }
    
    public async start() {
        await this.initDiscord();
        await this.sendInputForm(); // Добавляем отправку формы при инициализацииs
        await this.setupStatsChannel(); // Добавляем инициализацию канала статистики
        await this.setupGlobalStatsChannel();
        // await this.updateTopPlayers();
        this.startUpdateLoop();
    }

    private async initDiscord() {
        await this.discordClient.login(this.config.discord.token);
        console.log(`Logged in as ${this.discordClient.user?.tag}`);
    }

    private async setupStatsChannel() {
        try {
            if (!this.discordClient) {
                throw new Error('Discord клиент не инициализирован');
            }

            const channel = await this.discordClient.channels.fetch(process.env.STATS_CHANNEL_ID!);

            if (!(channel instanceof TextChannel)) {
                throw new Error('Канал статистики не найден или не является текстовым');
            }

            await PlayersStats.initialize(channel);
            console.log('Канал статистики успешно настроен');
        } catch (error) {
            console.error('Ошибка настройки канала статистики:', error);
        }
    }
    private async setupGlobalStatsChannel() {
        try {
            if (!this.discordClient) {
                throw new Error('Discord клиент не инициализирован');
            }

            const channel = await this.discordClient.channels.fetch(process.env.GLOBAL_STATS_CHANNEL_ID!);

            if (!(channel instanceof TextChannel)) {
                throw new Error('Канал статистики не найден или не является текстовым');
            }

            await PlayersStats.initialize(channel);
            console.log('Канал статистики успешно настроен');
        } catch (error) {
            console.error('Ошибка настройки канала статистики:', error);
        }
    }

    private async updateStatus() {
        await StatusManager.update(
            this.discordClient,
            this.config.a2s.ip,
            this.config.a2s.port
        );
    }

    private async updatePlayerList() {
        await PlayersManager.update(this.discordClient, this.config.discord.channelId);
    }

    // private async updateTopPlayers() {
    //     const connection = await pool.getConnection();
    //     try {
    //         await connection.beginTransaction();
    
    //         // Используем подзапрос вместо CTE
    //         await connection.query(`
    //             UPDATE players_stats ps
    //             JOIN (
    //                 SELECT 
    //                     p.player_id,
    //                     @rank := @rank + 1 AS top_rank
    //                 FROM 
    //                     players_stats p
    //                     JOIN players_info c ON p.player_id = c.player_id
    //                     CROSS JOIN (SELECT @rank := 0) r
    //                 WHERE 
    //                     p.playedTime > 60
    //                 ORDER BY 
    //                     p.ppm DESC
    //             ) AS ranks ON ps.player_id = ranks.player_id
    //             SET ps.top = ranks.top_rank
    //         `);
    
    //         await connection.commit();
    //     } catch (error) {
    //         await connection.rollback();
    //         console.error('Error updating top players:', error);
    //         throw error; // Перебрасываем ошибку для обработки выше
    //     } finally {
    //         connection.release();
    //     }
    // }

    private startUpdateLoop() {
        // Обновление статуса каждую минуту
        setInterval(() => this.updateStatus(), 60_000);
        
        // Обновление списка игроков каждые 2 минуты
        setInterval(() => this.updatePlayerList(), 120_000);

        // setInterval(() => this.updateTopPlayers(), 60_000 * 60)
        
        Promise.all([
            this.updateStatus(),
            this.updatePlayerList()
        ]).catch(console.error);
    }

    private readonly FORM_CONTENT = '**Система банов**';

private async sendInputForm() {
    try {
        const channel = await this.discordClient.channels.fetch(process.env.FORM_CHANNEL_ID!) as TextChannel;
        if (!channel) {
            console.error('Канал для формы не найден');
            return;
        }

        // Проверка прав бота в канале
        if (!this.hasChannelPermissions(channel)) {
            console.error('Недостаточно прав в канале');
            return;
        }

        const actionRow = this.createFormButtons();
        const existingMessage = await this.findFormMessage(channel);

        try {
            if (existingMessage) {
                await existingMessage.edit({
                    content: this.FORM_CONTENT,
                    components: [actionRow]
                });
            } else {
                await channel.send({
                    content: this.FORM_CONTENT,
                    components: [actionRow]
                });
            }
        } catch (error) {
            console.error('Ошибка обновления формы:', error);
            return;
        }

        this.setupFormHandlers();
    } catch (error) {
        console.error('Общая ошибка работы с формой:', error);
    }
}

private createFormButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents([
        new ButtonBuilder()
            .setCustomId('open_ban_form')
            .setLabel('Выдать бан')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('open_unban_form')
            .setLabel('Снять бан')
            .setStyle(ButtonStyle.Primary)
    ]);
}

private async findFormMessage(channel: TextChannel): Promise<Message | null> {
    try {
        const messages = await channel.messages.fetch({ limit: 20 });
        return messages.find(msg => 
            msg.author.id === this.discordClient.user?.id &&
            msg.content === this.FORM_CONTENT &&
            msg.components.some(c => 
                c.components.some(b => 
                    b.type === ComponentType.Button && 
                    ['open_ban_form', 'open_unban_form'].includes(b.customId || '')
                )
            )
        ) || null;
    } catch (error) {
        console.error('Ошибка поиска формы:', error);
        return null;
    }
}

private hasChannelPermissions(channel: TextChannel): boolean {
    const permissions = channel.guild.members.me?.permissionsIn(channel);
    return !!permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages
    ]);
}

private setupFormHandlers() {
    this.discordClient.on('interactionCreate', async interaction => {
        try {
            // Обработка статистики
            if (interaction.isButton() && interaction.customId === 'open_stats_form') {
                await interaction.showModal(PlayersStats.createStatsModal());
                return;
            }
            
            if (interaction.isModalSubmit() && interaction.customId === 'stats_form') {
                await PlayersStats.handleStatsRequest(interaction);
                return;
            }

            // Существующие обработчики
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