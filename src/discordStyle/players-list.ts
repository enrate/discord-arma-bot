import { EmbedBuilder, TextChannel, Message, Client } from 'discord.js';
import { rconClient } from '../rcon';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { parsePlayersData } from '../helper';


export class PlayersManager {
    static async update(
        client: Client,
        channelId: string,
        lastMessageId: string | null,
        messageFile: string
    ) {
        try {
            const channel = await client.channels.fetch(channelId) as TextChannel;
            if (!channel) return;

            const message = await this.getOrCreateMessage(channel, lastMessageId, messageFile);
            if (!message) return;

            const players = parsePlayersData(await rconClient.getPlayersWithTimeout());
            const embed = new EmbedBuilder()
                .setTitle('Игроки онлайн')
                .setDescription(players?.join('\n') || 'Сейчас никого нет')
                .setColor(0x00FF00);

            await message.edit({ content: '', embeds: [embed] });
        } catch (e) {
            console.error('Player list update error:', e);
        }
    }

    private static async getOrCreateMessage(
        channel: TextChannel,
        messageId: string | null,
        messageFile: string
    ) {
        if (!messageId) {
            const message = await channel.send('Инициализация...');
            this.saveMessageId(messageFile, message.id);
            return message;
        }

        try {
            return await channel.messages.fetch(messageId);
        } catch (error) {
            console.log('Message not found, creating new one');
            const message = await channel.send('Инициализация...');
            this.saveMessageId(messageFile, message.id);
            return message;
        }
    }

    private static saveMessageId(filePath: string, messageId: string) {
        try {
            writeFileSync(filePath, messageId);
        } catch (error) {
            console.error('Error saving message ID:', error);
        }
    }
}