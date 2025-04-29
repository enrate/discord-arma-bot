import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, ModalSubmitInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, Message, PermissionFlagsBits } from 'discord.js';
import {pool} from '../db'; // Убраны фигурные скобки
import { RowDataPacket } from 'mysql2';
import dayjs from 'dayjs';
import { createCanvas, Image, loadImage, registerFont } from 'canvas';
import path from 'path';

const fontsDir = path.join(process.cwd(), 'fonts');
const imagesDir = path.join(process.cwd(), 'images');


registerFont(path.join(fontsDir, 'Roboto-Bold.ttf'), {
    family: 'Roboto',
    weight: 'bold'
  });

  
  registerFont(path.join(fontsDir, 'Roboto-Regular.ttf'), {
    family: 'Roboto'
  });

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
                const [infoRows] = await connection.query<RowDataPacket[]>(
                    `SELECT * 
                    FROM players_info 
                    WHERE player_name = ? 
                    LIMIT 1`,
                    [playerName]
                );
                
                if (infoRows.length === 0) {
                    throw new Error('Игрок не найден в истории подключений');
                }
                const [connectionRows] = await connection.query<RowDataPacket[]>(
                    `SELECT *
            FROM player_connections pc
            JOIN players_info pi ON pc.id = pi.connection_id
            WHERE pi.player_name = ?`,
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
        const canvas = createCanvas(800, 700);
        const ctx = canvas.getContext('2d');
    
        // Рисуем фон
        const gradient = ctx.createLinearGradient(0, 0, 800, 700);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 800, 700);
    
        try {
            const avatar = await loadImage(data.avatarURL || path.join(imagesDir, 'default-avatar.png'));
            
            // Сохраняем текущие настройки контекста
            ctx.save();
            
            // Устанавливаем прозрачность (0.0 - полностью прозрачный, 1.0 - непрозрачный)
            ctx.globalAlpha = 0.5;
            
            ctx.drawImage(avatar, 400, 0, 800, 800);
            
            // Восстанавливаем предыдущие настройки
            ctx.restore();
        } catch (error) {
            console.error('Error loading avatar:', error);
        } 
        
        // Отрисовка с проверкой загруженных ресурсов
        // Стили текста
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
    
        // Заголовок
        
        ctx.save();
ctx.textAlign = 'center';

// Рассчитываем позицию по X
const centerX = canvas.width / 2;  // canvas - ваш объект холста

// Рисуем текст
ctx.font = 'bold 65px Roboto';
        
            ctx.fillText(playerName, centerX, 100);
    
ctx.restore();
    
        // Основная статистика
        ctx.font = '24px Roboto';
        let yPosition = 200;
        
        const hours = Math.floor(data.stats.playedTime / 60)
        const stats = [
            {title: "", value: ""},
            { title: 'K/D Ratio:', value: (data.stats.kills / (data.stats.deaths || 1)).toFixed(2) },
            { title: 'Kills:', value: data.stats.kills },
            { title: 'Deaths:', value: data.stats.deaths },
            { title: 'Suicides:', value: data.stats.suicide },
            { title: 'Team kills:', value: data.stats.teamkills },
            { title: 'TOP №:', value: data.stats.playedTime < 60 ? "Played time > 1 hour" : data.stats.top == 0 ? "Need more activity" : data.stats.top },
            { title: 'Played time:', value: `${hours} hours ${data.stats.playedTime-hours*60} minutes` },
            { title: 'First connect:', value: dayjs(data.connection.timestamp_first_connection).add(3, 'hour').format("DD.MM.YYYY HH:mm") },
            { title: 'Last connect:', value: dayjs(data.connection.timestamp_last_connection).add(3, 'hour').format("DD.MM.YYYY HH:mm") }
        ];

            // Рисуем статистику
            stats.forEach((stat, index) => {
                ctx.fillText(`${stat.title}`, 100, yPosition + (index * 50));
                ctx.fillText(String(stat.value), 400, yPosition + (index * 50));
            });
            
            // Добавляем графические элементы
            ctx.strokeStyle = '#e94560';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(50, 180);
            ctx.lineTo(750, 180);
            ctx.stroke();

            
            if (data.stats.top <= 3 && data.stats.top !== 0) {
                const medal = await loadImage(path.join(imagesDir, data.stats.top == 1 ? 'first-icon.png' : data.stats.top == 2 ? 'second-icon.png' : 'third-icon.png'));
                ctx.drawImage(medal, centerX + 200, 30, 200, 200);
            }

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
}