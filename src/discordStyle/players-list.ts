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
            
            // Если сообщение не найдено - создаем новое
            if (!message) {
                message = await this.createNewMessage(channel);
                if (!message) return;
            }

            const players = (await rconClient.getPlayers())
                .map(p => p.name)
                .filter(name => name && name.trim());

            const embed = new EmbedBuilder()
                .setTitle(this.EMBED_TITLE)
                .setDescription(players.length > 0 ? players.join('\n') : 'Сейчас никого нет')
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