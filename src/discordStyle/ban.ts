import { ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, ModalSubmitInteraction, TextChannel } from 'discord.js';
import { rconClient } from "../rcon";
import { EmbedBuilder } from 'discord.js';
import { isUUIDv4 } from '../helper';

export class BanForms {
    public static createBanModal() {
        return new ModalBuilder()
            .setCustomId('ban_form')
            .setTitle('Выдать бан')
            .addComponents(
                this.createBanIdInput(),
                this.createBanTimeInput(),
                this.createBanReasonInput()
            );
    }

    public static createUnbanModal() {
        return new ModalBuilder()
            .setCustomId('unban_form')
            .setTitle('Снять бан')
            .addComponents(
                this.createUnbanIdInput(),
                this.createUnbanReasonInput()
            );
    }

    private static createBanIdInput() {
        return new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId('ban_id_or_name')
                .setLabel("ID/Nickname")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ab6b9fa2-9ed8-434a-a2b6-bce11743372a / nickname')
                .setRequired(true)
        );
    }

    private static createBanTimeInput() {
        return new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId('ban_time')
                .setLabel("Время (часы)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('1, 2, 3, 5, 24, 48, 168')
                .setRequired(true)
        );
    }

    private static createBanReasonInput() {
        return new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId('ban_reason')
                .setLabel("Причина")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('bad boy')
                .setRequired(true)
        );
    }

    private static createUnbanIdInput() {
        return new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId('unban_id_or_name')
                .setLabel("ID")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ab6b9fa2-9ed8-434a-a2b6-bce11743372a / nickname')
                .setRequired(true)
        );
    }

    private static createUnbanReasonInput() {
        return new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId('unban_reason')
                .setLabel("Причина")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Хороший мальчик')
                .setRequired(true)
        );
    }

    public static async handleBanSubmit(interaction: ModalSubmitInteraction) {
        try {
            const ban_id_or_name = interaction.fields.getTextInputValue('ban_id_or_name');
            const ban_time = interaction.fields.getTextInputValue('ban_time');
            const ban_reason = interaction.fields.getTextInputValue('ban_reason');

            const timeNumber = parseInt(ban_time);
            if (isNaN(timeNumber)) {
                await interaction.reply({ content: '❌ Время бана должно быть числом!'});
                return;
            }

            const targetPlayer = await rconClient.banPlayer(ban_id_or_name, timeNumber, ban_reason);
            
            await this.sendSuccessResponse(
                interaction, 
                'ban', 
                {
                    ban_id_or_name: !isUUIDv4(targetPlayer.name) 
                        ? `${targetPlayer.uid}(${targetPlayer.name})` 
                        : ban_id_or_name,
                    ban_time,
                    ban_reason
                }
            );
        } catch (error) {
            console.error('Ошибка бана:', error);
            await interaction.reply({ 
                content: `❌ Ошибка бана: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    public static async handleUnbanSubmit(interaction: ModalSubmitInteraction) {
        try {
            const unban_id_or_name = interaction.fields.getTextInputValue('unban_id_or_name');
            const unban_reason = interaction.fields.getTextInputValue('unban_reason');

            await rconClient.unBanPlayer(unban_id_or_name);
            await this.sendSuccessResponse(interaction, 'unban', { unban_id_or_name, unban_reason });
            
        } catch (error) {
            console.error('Ошибка разбана:', error);
            await interaction.reply({ 
                content: `❌ Ошибка разбана: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    private static async sendSuccessResponse(
        interaction: ModalSubmitInteraction,
        type: 'ban' | 'unban',
        data: any
    ) {
        try {
            // Создаем embed
            const embed = this.createReportEmbed(interaction, type, data);

            // Отправляем в reports-канал
            await this.sendToReportsChannel(interaction, embed);

            if(type == 'ban'){
                await this.sendToGlobalReportsChannel(interaction, embed);
            }

            // Отправляем ответ инициатору
            await interaction.reply({ 
                content: '✅ Успешно!',
                components: []
            });


        } catch (error) {
            console.error('Ошибка отправки ответа:', error);
        }

        // Автоочистка через 5 секунд
        setTimeout(async () => {
            try { 
                await interaction.deleteReply(); 
            } catch(e) { 
                console.error('Ошибка очистки:', e); 
            }
        }, 5000);
    }

    private static createReportEmbed(
        interaction: ModalSubmitInteraction,
        type: 'ban' | 'unban',
        data: any
    ): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setAuthor({
                name: interaction.user.tag,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        if (type === 'ban') {
            embed.setTitle('Блокировка')
                .addFields(
                    { name: 'ID/Nickname игрока', value: data.ban_id_or_name },
                    { name: 'Время', value: `${data.ban_time} часов` },
                    { name: 'Причина', value: data.ban_reason }
                )
                .setColor(0xFF0000);
        } else {
            embed.setTitle('Снятие блокировки')
                .addFields(
                    { name: 'ID/Nickname игрока', value: data.unban_id_or_name },
                    { name: 'Причина', value: data.unban_reason }
                )
                .setColor(0x00FF00);
        }

        return embed;
    }

    private static async sendToReportsChannel(
        interaction: ModalSubmitInteraction, 
        embed: EmbedBuilder
    ) {
        try {
            const reportsChannelId = process.env.REPORTS_CHANNEL;

            if (!reportsChannelId) {
                throw new Error('REPORTS_CHANNEL не настроен в .env');
            }

            const channel = await interaction.client.channels.fetch(reportsChannelId) as TextChannel;
            
            if (!channel?.isTextBased()) {
                throw new Error('Канал для отчетов не найден или не текстовый');
            }

            await channel.send({ 
                embeds: [embed],
            });
            
        } catch (error) {
            console.error('Ошибка отправки в reports-канал:', error);
            throw error;
        }
    }
    private static async sendToGlobalReportsChannel(
        interaction: ModalSubmitInteraction, 
        embed: EmbedBuilder
    ) {
        try {
            const globalReportsChannelId = process.env.GLOBAL_REPORTS_CHANNEL;

            if (!globalReportsChannelId) {
                throw new Error('GLOBAL_REPORTS_CHANNEL не настроен в .env');
            }

            const channel = await interaction.client.channels.fetch(globalReportsChannelId) as TextChannel;
            
            if (!channel?.isTextBased()) {
                throw new Error('Канал для отчетов не найден или не текстовый');
            }

            await channel.send({ 
                embeds: [embed],
            });
            
        } catch (error) {
            console.error('Ошибка отправки в GLOBAL_reports-канал:', error);
            throw error;
        }
    }
}