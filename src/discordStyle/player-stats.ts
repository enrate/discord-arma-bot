// Добавить в класс BanForms или создать новый класс StatsHandler
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, ModalSubmitInteraction, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
const pool = require('../db');

export class PlayersStats {
    private static readonly STATS_TIMEOUT = 60000; // 1 минута

    public static async initialize(client: any) {
        const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID) as TextChannel;
        if (!channel) return;

        // Создаем кнопку для вызова формы
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('open_stats_form')
                    .setLabel('Поиск статистики')
                    .setStyle(ButtonStyle.Primary)
            );

        // Отправляем сообщение с кнопкой
        await channel.send({ 
            content: '**Поиск статистики игрока**',
            components: [row] 
        });
    }

    public static createStatsModal() {
        return new ModalBuilder()
            .setCustomId('stats_form')
            .setTitle('Поиск статистики')
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('player_name')
                        .setLabel("Введите ник игрока")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );
    }

    public static async handleStatsRequest(interaction: ModalSubmitInteraction) {
        const playerName = interaction.fields.getTextInputValue('player_name');
        
        try {
            const connection = await pool.getConnection();
            let stats;
            
            try {
                [stats] = await connection.query(
                    `SELECT * FROM player_connections 
                    WHERE player_name = ? 
                    ORDER BY timestamp_last_connection DESC 
                    LIMIT 1`,
                    [playerName]
                );
            } finally {
                connection.release();
            }

            const embed = this.createStatsEmbed(playerName, stats[0]);
            const reply = await interaction.reply({ 
                embeds: [embed], 
                fetchReply: true 
            });

            // Удаление через минуту
            setTimeout(() => reply.delete().catch(console.error), this.STATS_TIMEOUT);

        } catch (error) {
            console.error('Ошибка поиска:', error);
            const reply = await interaction.reply({
                content: `❌ Игрок "${playerName}" не найден`,
                ephemeral: true
            });
            
            setTimeout(() => reply.delete().catch(console.error), this.STATS_TIMEOUT);
        }
    }

    private static createStatsEmbed(playerName: string, data: any): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle(`Статистика игрока: ${playerName}`)
            .addFields(
                { name: 'ID игрока', value: data.player_id || 'Неизвестно' },
                { name: 'Первое подключение', value: data.timestamp_first_connection || 'Нет данных' },
                { name: 'Последнее подключение', value: data.timestamp_last_connection || 'Нет данных' }
            )
            .setColor(0x0099FF)
            .setTimestamp();
    }
}