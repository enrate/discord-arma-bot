import { EmbedBuilder, TextChannel, Client, Message } from 'discord.js';
import { rconClient } from '../rcon';
import fs from 'fs/promises';
import path from 'path';
import dayjs from 'dayjs';
import { pool } from '../db';
import { RowDataPacket } from 'mysql2';

export class PlayersManager {
    private static readonly EMBED_TITLE = 'Игроки онлайн';
    private static readonly TEMP_FILE_PATH = path.join(__dirname, '../../tmp/last_players.json');

    static async update(client: Client, channelId: string) {
        try {
            // Создаем временную папку если нужно
            await fs.mkdir(path.dirname(this.TEMP_FILE_PATH), { recursive: true });

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
            const currentPlayers = (await rconClient.getPlayers())
                .map(p => p.name)
                .filter(name => name && name.trim());

            // Сохраняем в временный файл
            await this.savePlayersToFile(currentPlayers);

            // Сравниваем с предыдущим списком
            await this.processDisconnectedPlayers(currentPlayers);

            // Обновляем сообщение
            const embed = new EmbedBuilder()
                .setTitle(this.EMBED_TITLE)
                .setDescription(currentPlayers.length > 0 ? currentPlayers.join('\n') : 'Сейчас никого нет')
                .setColor(0x00FF00);

            await message.edit({ embeds: [embed] });

        } catch (e) {
            console.error('Player list update error:', e);
        }
    }

    private static async savePlayersToFile(players: string[]) {
        try {
            await fs.writeFile(this.TEMP_FILE_PATH, JSON.stringify(players));
        } catch (error) {
            console.error('Error saving players to file:', error);
        }
    }

    private static async processDisconnectedPlayers(currentPlayers: string[]) {
        try {
            // Читаем предыдущий список
            let previousPlayers: string[] = [];
            try {
                const data = await fs.readFile(this.TEMP_FILE_PATH, 'utf-8');
                previousPlayers = JSON.parse(data);
            } catch (e) {
                // Файл не существует - это нормально при первом запуске
                return;
            }

            // Находим вышедших игроков
            const disconnectedPlayers = previousPlayers.filter(
                player => !currentPlayers.includes(player)
            );

            // Обновляем время игры для каждого вышедшего игрока
            for (const playerName of disconnectedPlayers) {
                const connection = await pool.getConnection();
                try {
                    // Получаем последнее подключение
                    const [rows] = await connection.query<RowDataPacket[]>(
                        `SELECT timestamp_last_connection 
                        FROM player_connections 
                        WHERE player_name = ? 
                        ORDER BY timestamp_last_connection DESC 
                        LIMIT 1`,
                        [playerName]
                    );

                    if (rows.length > 0) {
                        const lastConnection = rows[0].timestamp_last_connection;
                        const minutesPlayed = dayjs().diff(dayjs(lastConnection), 'minute', true);
                        
                        // Обновляем playedTime
                        await connection.query(
                            `UPDATE players_stats 
                            SET playedTime = playedTime + ? 
                            WHERE player_id = (
                                SELECT player_id 
                                FROM player_connections 
                                WHERE player_name = ? 
                                ORDER BY timestamp_last_connection DESC 
                                LIMIT 1
                            )`,
                            [minutesPlayed, playerName]
                        );
                    }
                } finally {
                    connection.release();
                }
            }
        } catch (error) {
            console.error('Error processing disconnected players:', error);
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