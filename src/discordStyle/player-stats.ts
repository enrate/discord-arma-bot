import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Interaction, EmbedBuilder, TextChannel, ModalSubmitInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, Message, PermissionFlagsBits } from 'discord.js';
import {pool} from '../db'; // Убраны фигурные скобки
import { RowDataPacket } from 'mysql2';
import dayjs from 'dayjs';
import { createCanvas, Image, loadImage, registerFont } from 'canvas';
import path from 'path';
import { getSteamAvatar } from '../helper';

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
                        .setPlaceholder("Nickname")
                        .setRequired(true)
                )
            );
    }

    public static async handleStatsRequest(interaction: ModalSubmitInteraction) {
        try {
            await interaction.deferReply({ flags: 'Ephemeral' });
            
            const playerName = interaction.fields.getTextInputValue('player_name');
            const connection = await pool.getConnection();
            
            try {
                const [infoRows] = await connection.query<RowDataPacket[]>(
                    `SELECT * 
                    FROM players_info 
                    WHERE player_name = ?`,
                    [playerName]
                );
                
                if (infoRows.length === 0) {
                    throw new Error('Игрок не найден в истории подключений');
                }

                if (infoRows.length > 1) {
                    // Создаем кнопки для выбора игрока
                    
                    const embeds = [];
const buttons = [];

for (const player of infoRows) {
    // Получаем аватарку
    let avatarUrl = null; // Дефолтный аватар
    if (player.platformName == 'Steam') {
        avatarUrl = (await getSteamAvatar(player.platformId))?.url
    }

    // Создаем эмбед с аватаром
    const embed = new EmbedBuilder()
        .setTitle(player.player_name)
        .setImage(avatarUrl)
        .addFields(
            { name: 'Player ID', value: player.player_id || 'Неизвестно' },
            { name: 'Steam ID64', value: player.platformName == 'Steam' ? `https://steamcommunity.com/profiles/${player.platformId}` : 'Неизвестно'}
    )
        .setColor('#0099ff');

    embeds.push(embed);

    // Создаем кнопку
    const button = new ButtonBuilder()
        .setCustomId(`select_player_${player.player_id}`)
        .setLabel(`Выбрать ${player.player_id}`)
        .setStyle(ButtonStyle.Primary);

    buttons.push(button);
}
const actionRows = [];
while (buttons.length > 0) {
    actionRows.push(
        new ActionRowBuilder<ButtonBuilder>()
            .addComponents(buttons.splice(0, 5))
    );
}
const reply = await interaction.editReply({
    content: `Найдено несколько игроков с ником "${playerName}":`,
    embeds: embeds,
    components: actionRows
});

    
                    // Ожидаем выбор игрока в течение 60 секунд
                    const filter = (i: Interaction) => {
                        // Проверяем что это именно кнопка
                        if (!i.isButton()) return false;
                        
                        // Проверяем пользователя и префикс кастомного ID
                        return i.user.id === interaction.user.id && 
                               i.customId.startsWith('select_player_');
                    };
                    
                    try {
                        const response = await reply.awaitMessageComponent<ComponentType.Button>({
                            filter,
                            time: 60000
                        });
    
                        // Извлекаем player_id из customId
                        const playerId = response.customId.split('_')[2];

                        const platformData = infoRows.find((info) => info.player_id == playerId)
                        // Удаляем кнопки
                        await response.update({
                            content: 'Загрузка статистики...',
                            components: []
                        });
    
                        // Далее ваша логика обработки выбранного игрока
                        const [connectionRows] = await connection.query<RowDataPacket[]>(
                            `SELECT *
                            FROM player_connections pc
                            JOIN players_info pi ON pc.id = pi.connection_id
                            WHERE pi.player_id = ?`,
                            [playerId]
                        );
    
                        if (connectionRows.length === 0) {
                            throw new Error('Игрок не найден в истории подключений');
                        }
                                
                        const [statsRows] = await connection.query<RowDataPacket[]>(
                            `SELECT * FROM players_stats 
                            WHERE player_id = ?`,
                            [playerId]
                        );
                        
                        if (statsRows.length === 0) {
                            throw new Error('Статистика игрока не найдена');
                        }
                        
                        const playerStats = {connection: connectionRows[0], stats: statsRows[0]};
            
            const embed = await this.createStatsEmbed(playerName, playerStats, platformData);
            const imageBuffer = await this.createStatsImage(playerName, playerStats, platformData);
        
                        await interaction.editReply({content: '', embeds: [embed], files: [{
                            attachment: imageBuffer,
                            name: 'stats.png'
                        }] });
    
                    } catch (error) {
                        await interaction.editReply({
                            content: 'Время выбора истекло',
                            embeds: [],
                            components: []
                        });
                    }
                }
                if (infoRows.length === 1) {

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
    
    const embed = await this.createStatsEmbed(playerName, playerStats, infoRows[0]);
    const imageBuffer = await this.createStatsImage(playerName, playerStats, infoRows[0]);

                await interaction.editReply({ embeds: [embed], files: [{
                    attachment: imageBuffer,
                    name: 'stats.png'
                }] });
            }
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

    private static async createStatsImage(playerName: string, data: any, platformData: any): Promise<Buffer> {
        let platformImage = null;
        if (platformData.platformName == 'Steam') {
            platformImage = await getSteamAvatar(platformData.platformId)
        }
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
            const platformAvatar = await loadImage(platformImage?.buffer || path.join(imagesDir, 'default-avatar-platform.png'));
            
            // Сохраняем текущие настройки контекста
            ctx.save();
            
            // Устанавливаем прозрачность (0.0 - полностью прозрачный, 1.0 - непрозрачный)
            ctx.drawImage(platformAvatar, 50, 25, 100, 100);
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
await this.drawAdaptiveText(ctx, playerName, 500);

// // Рассчитываем позицию по X
const centerX = canvas.width / 2;  // canvas - ваш объект холста
    
        // Основная статистика
        ctx.font = '24px Roboto';
        let yPosition = 200;
        
        const hours = Math.floor(data.stats.playedTime / 60)
        const stats = [
            {title: "", value: ""},
            { title: 'ELO:', value: data.stats.ppm.toFixed(0) },
            { title: 'K/D Ratio:', value: (data.stats.kills / (data.stats.deaths || 1)).toFixed(2) },
            { title: 'Kills:', value: data.stats.kills },
            { title: 'Deaths:', value: data.stats.deaths },
            { title: 'Suicides:', value: data.stats.suicide },
            { title: 'Team kills:', value: data.stats.teamkills },
            { title: 'TOP №:', value: data.stats.playedTime < 120 ? "Played time > 2 hour" :  data.stats.kills < 50 ? "Kills > 50" : data.stats.top == 0 ? "Need more activity" : data.stats.top },
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

    private static async createStatsEmbed(playerName: string, data: any, info: any): Promise<EmbedBuilder> {        
        return new EmbedBuilder()
            .setTitle(`Статистика игрока: ${playerName}`)
            .setColor(0x0099FF)
            .setImage('attachment://stats.png')
            .addFields(
                { name: 'Player ID', value: data.connection.player_id || 'Неизвестно' },
                { name: 'Steam ID64', value: info.platformName == 'Steam' ? `https://steamcommunity.com/profiles/${info.platformId}` : 'Неизвестно'}
            )
            .setTimestamp()
            .setFooter({ text: 'Статистика обновлена' });
    }
    private static async drawAdaptiveText(ctx:any, text:any, maxWidth:any, initialFontSize = 65, minFontSize = 20) {
        let fontSize = initialFontSize;
        const centerX = ctx.canvas.width / 2;
        const yPosition = 100;
        
        // Сохраняем исходные настройки контекста
        ctx.save();
        
        do {
            // Устанавливаем текущий размер шрифта
            ctx.font = `bold ${fontSize}px Roboto`;
            
            // Измеряем ширину текста
            const textWidth = ctx.measureText(text).width;
            
            // Если текст помещается - выходим из цикла
            if(textWidth <= maxWidth) break;
            
            // Уменьшаем размер шрифта
            fontSize -= 2;
            
        } while(fontSize > minFontSize);
    
        // Если достигнут минимальный размер - обрезаем текст
        if(fontSize <= minFontSize) {
            text = this.truncateText(ctx, text, maxWidth);
        }
    
        // Рисуем текст с финальным размером
        ctx.textAlign = 'center';
        ctx.fillText(text, centerX, yPosition);
        
        // Восстанавливаем исходные настройки
        ctx.restore();
    }
    private static async truncateText(ctx:any, text:any, maxWidth:any) {
        const ellipsis = '...';
        let truncated = text;
        
        while(ctx.measureText(truncated + ellipsis).width > maxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
        }
        
        return truncated + ellipsis;
    }
}