// Добавить в класс BanForms или создать новый класс StatsHandler
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, ModalSubmitInteraction, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import {pool} from '../db'; // Убраны фигурные скобки

export class PlayersStats {
    private static readonly STATS_TIMEOUT = 60000; // 1 минута

    public static async initialize(channel: TextChannel) {
        try {
            // Проверяем доступность канала
            if (!channel.isTextBased()) {
                throw new Error('Канал не является текстовым');
            }

            // Очищаем предыдущие сообщения бота
            await this.cleanupChannel(channel);

            // Создаем кнопку
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('show_stats')
                        .setLabel('Показать статистику')
                        .setStyle(ButtonStyle.Primary)
                );

            // Отправляем сообщение с кнопкой
            await channel.send({
                content: '**Получить статистику игрока**',
                components: [row]
            });
            
        } catch (error) {
            console.error('Ошибка инициализации канала статистики:', error);
            throw error;
        }
    }
    private static async cleanupChannel(channel: TextChannel) {
        try {
            const messages = await channel.messages.fetch({ limit: 100 });
            const botMessages = messages.filter(msg => msg.author.id === channel.client.user?.id);
            
            await Promise.all(botMessages.map(msg => msg.delete()));
        } catch (error) {
            console.error('Ошибка очистки канала:', error);
        }
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
                console.log(stats)
            } finally {
                connection.release();
            }

            const embed = this.createStatsEmbed(playerName, stats);
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