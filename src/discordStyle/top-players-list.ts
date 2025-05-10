import { EmbedBuilder, TextChannel, Client, Message } from 'discord.js';
import { pool } from '../db'; // Убраны фигурные скобки
import { RowDataPacket } from 'mysql2';

export class TopPlayersManager {
    private static readonly EMBED_TITLE = 'Топ 20 игроков:';

    static async update(client: Client, channelId: string) {
        try {
            const channel = await client.channels.fetch(channelId) as TextChannel;
            if (!channel) {
                console.error(`Канал ${channelId} не найден`);
                return;
            }

            let message = await this.findLastBotMessage(channel);

            if (!message) {
                message = await this.createNewMessage(channel);
                if (!message) return;
            }

            // Получаем текущий список игроков
            const connection = await pool.getConnection();

                const [topPlayers] = await connection.query<RowDataPacket[]>(
                    `SELECT 
        ps.*, 
        pi.player_name 
     FROM 
        players_stats ps 
     INNER JOIN 
        players_info pi 
     ON 
        ps.id = pi.stats_id
     WHERE 
        ps.top BETWEEN 1 AND 20 
     ORDER BY 
        ps.top ASC 
     LIMIT 20`
                );

                if (topPlayers.length === 0) {
                    throw new Error('Игрок не найден в истории подключений');
                }

                // Обновляем сообщение
                const listPlayers = topPlayers.map(p => {
    const kd = (p.kills / p.deaths);
    
    // Иконки для первых трех мест
    const positionIcon = 
        p.top === 1 ? '🥇' : 
        p.top === 2 ? '🥈' : 
        p.top === 3 ? '🥉' : 
        `**${p.top}.**`;

    // Цветовые акценты для K/D
    const kdDisplay = kd >= 4 ? `🔥${kd.toFixed(2)}` : 
                     kd >= 2 ? `⚡${kd.toFixed(2)}` : 
                     kd >= 1 ? `🟢${kd.toFixed(2)}` : 
                     `🔻${kd.toFixed(2)}`;

    return `${positionIcon} **${p.player_name}**\n` +
           `⚡ ELO:  **${String(p.ppm).padEnd(6, ' ')}` +
           `   ⚔️ K/D:  ${kdDisplay.padEnd(5, ' ')}` + 
           `   🎯 ${String(p.kills).padEnd(4, ' ')}` + 
           `   ☠️ ${p.deaths}`;  
});

const embed = new EmbedBuilder()
    .setTitle('🏆 ТОП-20 ИГРОКОВ 🏆')
    .setDescription(listPlayers.length > 0 ? listPlayers.join('\n\n') : '🎮 Сейчас никого нет')
    .setColor(0xFFD700)
    .setFooter({ text: '⚔️ - убийства/смерти | ⚡ - рейтинг эффективности' })
    .setThumbnail('https://i.imgur.com/tyz2EAE.png'); // URL иконки для оформления

                await message.edit({ embeds: [embed] });

            } catch (e) {
                console.error('Player list update error:', e);
            }
        }

    private static async findLastBotMessage(channel: TextChannel): Promise<Message | null> {
        try {
            const messages = await channel.messages.fetch({ limit: 10 });
            return messages.find(msg =>
                msg.author.id === channel.client.user?.id &&
                msg.embeds[0]?.title === this.EMBED_TITLE
            ) || null;
        } catch (error) {
            console.error('Error finding message:', error);
            return null;
        }
    }

    private static async createNewMessage(channel: TextChannel): Promise<Message | null> {
        try {
            return await channel.send({
                embeds: [new EmbedBuilder().setTitle(this.EMBED_TITLE)]
            });
        } catch (error) {
            console.error('Error creating new message:', error);
            return null;
        }
    }
}