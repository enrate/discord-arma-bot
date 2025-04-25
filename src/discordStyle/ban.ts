import { ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, ModalSubmitInteraction } from 'discord.js';
import { rconClient } from "../rcon";
import { EmbedBuilder } from 'discord.js';

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
                .setCustomId('ban_id')
                .setLabel("ID")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ab6b9fa2-9ed8-434a-a2b6-bce11743372a')
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
                .setCustomId('unban_id')
                .setLabel("ID")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ab6b9fa2-9ed8-434a-a2b6-bce11743372a')
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
            const ban_id = interaction.fields.getTextInputValue('ban_id');
            const ban_time = interaction.fields.getTextInputValue('ban_time');
            const ban_reason = interaction.fields.getTextInputValue('ban_reason');

            const timeNumber = parseInt(ban_time);
            if (isNaN(timeNumber)) {
                await interaction.reply({ content: '❌ Время бана должно быть числом!', ephemeral: true });
                return;
            }

            await rconClient.banPlayer(ban_id, timeNumber, ban_reason);
            await this.sendSuccessResponse(interaction, 'ban', { ban_id, ban_time, ban_reason });
            
        } catch (error) {
            console.error('Ошибка бана:', error);
            await interaction.reply({ 
                content: `❌ Ошибка бана: ${error instanceof Error ? error.message : 'Unknown error'}`,
                ephemeral: true 
            });
        }
    }

    public static async handleUnbanSubmit(interaction: ModalSubmitInteraction) {
        try {
            const unban_id = interaction.fields.getTextInputValue('unban_id');
            const unban_reason = interaction.fields.getTextInputValue('unban_reason');

            await rconClient.unBanPlayer(unban_id);
            await this.sendSuccessResponse(interaction, 'unban', { unban_id, unban_reason });
            
        } catch (error) {
            console.error('Ошибка разбана:', error);
            await interaction.reply({ 
                content: `❌ Ошибка разбана: ${error instanceof Error ? error.message : 'Unknown error'}`,
                ephemeral: true 
            });
        }
    }

    private static async sendSuccessResponse(
        interaction: ModalSubmitInteraction,
        type: 'ban' | 'unban',
        data: any
    ) {
        await interaction.reply({ 
            content: '✅ Успешно!',
            components: [],
            ephemeral: true
        });

        const embed = new EmbedBuilder()
            .setAuthor({
                name: interaction.user.tag,
                iconURL: interaction.user.displayAvatarURL()
            });

        if (type === 'ban') {
            embed.setTitle('Блокировка')
                .addFields(
                    { name: 'ID игрока', value: data.ban_id },
                    { name: 'Время', value: `${data.ban_time} часов` },
                    { name: 'Причина', value: data.ban_reason }
                )
                .setColor(0xFF0000);
        } else {
            embed.setTitle('Снятие блокировки')
                .addFields(
                    { name: 'ID игрока', value: data.unban_id },
                    { name: 'Причина', value: data.unban_reason }
                )
                .setColor(0x00FF00);
        }

        await interaction.followUp({ embeds: [embed], ephemeral: true });
        
        setTimeout(async () => {
            try { await interaction.deleteReply(); } 
            catch(e) { console.error('Delete error:', e); }
        }, 5000);
    }
}