import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, ModalSubmitInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, Message, PermissionFlagsBits } from 'discord.js';
import {pool} from '../db'; // Убраны фигурные скобки
import { RowDataPacket } from 'mysql2';
import dayjs from 'dayjs';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { join } from 'path';

registerFont(join(__dirname, '../fonts/Roboto-Bold.ttf'), { family: 'Roboto', weight: 'bold' });
registerFont(join(__dirname,'../fonts/Roboto-Regular.ttf'), { family: 'Roboto' });

export class PlayersStats {
    private static readonly STATS_TIMEOUT = 60000; // 1 минута
    private static readonly STATS_CONTENT = '**Получить статистику игрока**';

    public static async initialize(channel: TextChannel) {
        try {
            console.log('Инициализация канала статистики...');
            
            // Проверяем доступность канала и права
            if (!channel.isTextBased()) {
                throw new Error('Канал не является текстовым');
            }

            // Проверяем права бота
            const permissions = channel.guild.members.me?.permissionsIn(channel);
            const requiredPermissions = [
                { flag: PermissionFlagsBits.ViewChannel, name: 'Просмотр канала' },
                { flag: PermissionFlagsBits.SendMessages, name: 'Отправка сообщений' },
                { flag: PermissionFlagsBits.ReadMessageHistory, name: 'Чтение истории сообщений' }
            ];

            const missingPermissions = requiredPermissions.filter(
                perm => !permissions?.has(perm.flag)
            );

            if (missingPermissions.length > 0) {
                const missingPermsText = missingPermissions
                    .map(p => p.name)
                    .join(', ');
                throw new Error(`Недостаточно прав для работы с каналом статистики. Отсутствуют права: ${missingPermsText}`);
            }

            console.log('Проверка прав успешна, продолжаем инициализацию...');

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
            console.log('Результат поиска сообщения:', existingMessage ? 'найдено' : 'не найдено');

            if (existingMessage) {
                console.log('Обновляем существующее сообщение...');
                // Обновляем существующее сообщение
                await existingMessage.edit({
                    content: this.STATS_CONTENT,
                    components: [row]
                });
                console.log('Сообщение успешно обновлено');
            } else {
                console.log('Создаем новое сообщение...');
                // Отправляем новое сообщение
                const newMessage = await channel.send({
                    content: this.STATS_CONTENT,
                    components: [row]
                });
                console.log('Новое сообщение создано с ID:', newMessage.id);
            }
            
        } catch (error) {
            console.error('Ошибка инициализации канала статистики:', error);
            throw error;
        }
    }

    private static async findStatsMessage(channel: TextChannel): Promise<Message | null> {
        try {
            console.log('Поиск существующего сообщения статистики...');
            
            // Увеличиваем лимит сообщений для поиска
            const messages = await channel.messages.fetch({ limit: 100 });
            console.log(`Найдено ${messages.size} сообщений в канале`);
            
            const foundMessage = messages.find(msg => {
                const isFromBot = msg.author.id === channel.client.user?.id;
                const hasCorrectContent = msg.content === this.STATS_CONTENT;
                const hasCorrectButton = msg.components.some(c => 
                    c.components.some(b => b.customId === 'open_stats_form')
                );
                
                if (isFromBot) {
                    console.log('Найдено сообщение от бота:', {
                        messageId: msg.id,
                        content: msg.content,
                        hasCorrectContent,
                        hasCorrectButton,
                        components: msg.components.map(c => 
                            c.components.map(b => ({
                                customId: b.customId,
                                type: b.type
                            }))
                        )
                    });
                }
                
                return isFromBot && hasCorrectContent && hasCorrectButton;
            });

            if (foundMessage) {
                console.log('Найдено существующее сообщение:', foundMessage.id);
            } else {
                console.log('Существующее сообщение не найдено');
            }
            
            return foundMessage || null;
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
                const [connectionRows] = await connection.query<RowDataPacket[]>(
                    `SELECT player_id 
                    FROM player_connections 
                    WHERE player_name = ? 
                    ORDER BY timestamp_last_connection DESC 
                    LIMIT 1`,
                    [playerName]
                );
                
                if (connectionRows.length === 0) {
                    throw new Error('Игрок не найден в истории подключений');
                }
                
                const playerId = connectionRows[0].player_id;
                
                const [statsRows] = await connection.query<RowDataPacket[]>(
                    `SELECT * FROM players_stats 
                    WHERE player_id = ?`,
                    [playerId]
                );
                
                if (statsRows.length === 0) {
                    throw new Error('Статистика игрока не найдена');
                }
                
                const playerStats = {connection: connectionRows[0], stats: statsRows[0]};
    
                // const embed = this.createStatsEmbed(playerName, playerStats);
                // Использование
    const embed = await this.createStatsEmbed(playerName, playerStats);
    const imageBuffer = await this.createStatsImage(playerName, playerStats);

                await interaction.editReply({ embeds: [embed], files: [{
                    attachment: imageBuffer,
                    name: 'stats.png'
                }] });
    
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

    private static async createStatsImage(playerName: string, data: any): Promise<Buffer> {
        // Создаем холст
        const canvas = createCanvas(800, 600);
        const ctx = canvas.getContext('2d');
    
        // Рисуем фон
        const gradient = ctx.createLinearGradient(0, 0, 800, 600);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 800, 600);
    
        // Загружаем и рисуем аватар (пример)
        try {
            const avatar = await loadImage(data.avatarURL || 'default-avatar.png');
            ctx.drawImage(avatar, 50, 50, 150, 150);
        } catch (error) {
            console.error('Error loading avatar:', error);
        }
    
        // Стили текста
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
    
        // Заголовок
        ctx.font = 'bold 36px Roboto';
        ctx.fillText(`Статистика игрока: ${playerName}`, 250, 100);
    
        // Основная статистика
        ctx.font = '24px Roboto';
        let yPosition = 200;
        
        const stats = [
            { title: 'K/D Ratio', value: (data.stats.kills / (data.stats.deaths || 1)).toFixed(2) },
            { title: 'Убийства', value: data.stats.kills },
            { title: 'Смерти', value: data.stats.deaths },
            { title: 'Суициды', value: data.stats.suicide },
            { title: 'Тимкиллы', value: data.stats.teamkills },
            { title: 'Первое подключение', value: dayjs(data.connection.timestamp_first_connection).format("DD.MM.YYYY HH:mm") },
            { title: 'Последнее подключение', value: dayjs(data.connection.timestamp_last_connection).format("DD.MM.YYYY HH:mm") }
        ];
    
        // Рисуем статистику
        stats.forEach((stat, index) => {
            ctx.fillText(`${stat.title}:`, 100, yPosition + (index * 50));
            ctx.fillText(String(stat.value), 400, yPosition + (index * 50));
        });
    
        // Добавляем графические элементы
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(50, 180);
        ctx.lineTo(750, 180);
        ctx.stroke();
    
        // Конвертируем в Buffer
        return canvas.toBuffer('image/png');
    }

    private static async createStatsEmbed(playerName: string, data: any): Promise<EmbedBuilder> {        
        return new EmbedBuilder()
            .setTitle(`Статистика игрока: ${playerName}`)
            .setColor(0x0099FF)
            .setImage('attachment://stats.png')
            .addFields(
                { name: 'Player ID', value: data.connection.player_id || 'Неизвестно' }
            )
            .setTimestamp()
            .setFooter({ text: 'Статистика обновлена' });
    }
    

    // private static createStatsEmbed(playerName: string, data: any): EmbedBuilder {
    //     return new EmbedBuilder()
    //         .setTitle(`Статистика игрока: ${playerName}`)
    //         .addFields(
    //             { name: 'ID игрока', value: data.connection.player_id || 'Неизвестно', inline: false },
    //             { name: 'Соотношение убийств и смертей', value: String(Number(data.stats.kills/data.stats.deaths)), inline: false},
    //             { name: 'Убийства', value: String(data.stats.kills) || 'Нет данных', inline: false },
    //             { name: 'Смерти', value: String(data.stats.deaths) || 'Нет данных', inline: false },
    //             { name: 'Суициды', value: String(data.stats.suicide) || 'Нет данных', inline: false },
    //             { name: 'Убийство союзников', value: String(data.stats.teamkills) || 'Нет данных', inline: false },
    //             { name: 'Первое подключение', value: dayjs(data.connection.timestamp_first_connection).format("HH:mm:ss | DD.MM.YYYY") || 'Нет данных', inline: false },
    //             { name: 'Последнее подключение', value: dayjs(data.connection.timestamp_last_connection).format("HH:mm:ss | DD.MM.YYYY") || 'Нет данных', inline: false },
    //         )
    //         .setColor(0x0099FF)
    //         .setTimestamp();
    // }
}