import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, ModalSubmitInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, Message, PermissionFlagsBits } from 'discord.js';
import {pool} from '../db'; // Убраны фигурные скобки
import { RowDataPacket } from 'mysql2';

export class FindPlayerNickName {
    private static readonly SEARCH_NICKNAME_CONTENT = '**Получить информацию о никнеймах игрока**';
    private static readonly EMBED_TITLE = 'Список предыдущих никнеймов';


    public static async initialize(channel: TextChannel) {
        try {
            console.log('Инициализация канала поиска ника...');
            
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
                throw new Error(`Недостаточно прав для работы с каналом поиска ников. Отсутствуют права: ${missingPermsText}`);
            }

            console.log('Проверка прав успешна, продолжаем инициализацию...');

            // Создаем кнопку
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_find_nickname_form')
                        .setLabel('Найти историю ников игрока')
                        .setStyle(ButtonStyle.Primary)
                );

            // Ищем существующее сообщение
            const existingMessage = await this.findSearchNicknameMessage(channel);
            console.log('Результат поиска сообщения:', existingMessage ? 'найдено' : 'не найдено');

            if (existingMessage) {
                console.log('Обновляем существующее сообщение...');
                // Обновляем существующее сообщение
                await existingMessage.edit({
                    content: this.SEARCH_NICKNAME_CONTENT,
                    components: [row]
                });
                console.log('Сообщение успешно обновлено');
            } else {
                console.log('Создаем новое сообщение...');
                // Отправляем новое сообщение
                const newMessage = await channel.send({
                    content: this.SEARCH_NICKNAME_CONTENT,
                    components: [row]
                });
                console.log('Новое сообщение создано с ID:', newMessage.id);
            }
            
        } catch (error) {
            console.error('Ошибка инициализации канала статистики:', error);
            throw error;
        }
    }

    private static async findSearchNicknameMessage(channel: TextChannel): Promise<Message | null> {
        try {
            console.log('Поиск существующего сообщения статистики...');
            
            // Увеличиваем лимит сообщений для поиска
            const messages = await channel.messages.fetch({ limit: 100 });
            console.log(`Найдено ${messages.size} сообщений в канале`);
            
            const foundMessage = messages.find(msg => {
                const isFromBot = msg.author.id === channel.client.user?.id;
                const hasCorrectContent = msg.content === this.SEARCH_NICKNAME_CONTENT;
                const hasCorrectButton = msg.components.some(c => 
                    c.components.some(b => b.customId === 'open_find_nickname_form')
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
            console.error('Ошибка поиска сообщения истории никнеймов:', error);
            return null;
        }
    }

    public static createSearchNicnNameModal() {
        return new ModalBuilder()
            .setCustomId('find_nickname_form')
            .setTitle('Поиск истории никнеймов игрока')
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('player_id')
                        .setLabel("Введите id игрока")
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder("76ef671f-eae2-4988-9a49-8e4e8bdb90e2")
                        .setRequired(true)
                )
            );
    }

    public static async handleSearchNickNameRequest(interaction: ModalSubmitInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const playerId = interaction.fields.getTextInputValue('player_id');
            const connection = await pool.getConnection();
            
            try {
                const [infoRows] = await connection.query<RowDataPacket[]>(
                    `SELECT DISTINCT player_name 
                    FROM temp_player_events 
                    WHERE player_id = ?`,
                    [playerId]
                );
                
                if (infoRows.length === 0) {
                    throw new Error('Игрок не найден в истории подключений');
                }
                
                const embed = new EmbedBuilder()
                .setTitle(this.EMBED_TITLE)
                .setDescription(infoRows.map((player) => { return `${player.player_name}\n`}).join(''))
                .setColor(0x00FF00);

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
}
