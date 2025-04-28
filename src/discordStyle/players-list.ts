import { EmbedBuilder, TextChannel, Client, Message } from 'discord.js';
import { rconClient } from '../rcon';

export class PlayersManager {
    private static readonly EMBED_TITLE = 'Игроки онлайн';

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
            const currentPlayers = (await rconClient.getPlayers())
                .map(p => p.name)
                .filter(name => name && name.trim());


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