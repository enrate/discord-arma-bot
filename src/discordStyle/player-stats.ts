import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, ModalSubmitInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, Message } from 'discord.js';
import {pool} from '../db'; // Убраны фигурные скобки
import { RowDataPacket } from 'mysql2';
import dayjs from 'dayjs';

export class PlayersStats {
    private static readonly STATS_TIMEOUT = 60000; // 1 минута
    private static readonly STATS_CONTENT = '**Получить статистику игрока**';

    public static async initialize(channel: TextChannel) {
        try {
            // Проверяем доступность канала
            if (!channel.isTextBased()) {
                throw new Error('Канал не является текстовым');
            }

            // Создаем кнопку
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_stats_form')
                        .setLabel('Показать статистику')
                        .setStyle(ButtonStyle.Primary)
                );

            // Ищем существующее сообщение
            const existingMessage = await this.findStatsMessage(channel);

            if (existingMessage) {
                // Обновляем существующее сообщение
                await existingMessage.edit({
                    content: this.STATS_CONTENT,
                    components: [row]
                });
            } else {
                // Отправляем новое сообщение
                await channel.send({
                    content: this.STATS_CONTENT,
                    components: [row]
                });
            }
            
        } catch (error) {
            console.error('Ошибка инициализации канала статистики:', error);
            throw error;
        }
    }

    private static async findStatsMessage(channel: TextChannel): Promise<Message | null> {
        try {
            const messages = await channel.messages.fetch({ limit: 20 });
            return messages.find(msg => 
                msg.author.id === channel.client.user?.id &&
                msg.content === this.STATS_CONTENT &&
                msg.components.some(c => 
                    c.components.some(b => 
                        b.customId === 'open_stats_form'
                    )
                )
            ) || null;
        } catch (error) {
            console.error('Ошибка поиска сообщения статистики:', error);
            return null;
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
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const playerName = interaction.fields.getTextInputValue('player_name');
            const connection = await pool.getConnection();
            
            try {
                const [rows] = await connection.query<RowDataPacket[]>(
                    `SELECT * FROM player_connections 
                    WHERE player_name = ? 
                    ORDER BY timestamp_last_connection DESC 
                    LIMIT 1`,
                    [playerName]
                );
                console.log(rows)
    
                if (rows.length === 0) {
                    throw new Error('Игрок не найден');
                }
    
                const embed = this.createStatsEmbed(playerName, rows[0]);
                await interaction.editReply({ embeds: [embed] });
    
            } finally {
                connection.release();
            }
    
        } catch (error) {
            console.error('Ошибка поиска:', error);
            await interaction.editReply({
                content: `❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
            });
        }
        
        setTimeout(async () => {
            try {
                await interaction.deleteReply();
            } catch(e) {
                console.error('Ошибка удаления ответа:', e);
            }
        }, 60000);
    }

    private static createStatsEmbed(playerName: string, data: any): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle(`Статистика игрока: ${playerName}`)
            .addFields(
                { name: 'ID игрока', value: data.player_id || 'Неизвестно' },
                { name: 'Первое подключение', value: dayjs(data.timestamp_first_connection).format("HH.mm.ss | DD.MM.YYYY") || 'Нет данных' },
                { name: 'Последнее подключение', value: dayjs(data.timestamp_last_connection).format("HH.mm.ss | DD.MM.YYYY") || 'Нет данных' }
            )
            .setColor(0x0099FF)
            .setTimestamp();
    }
}