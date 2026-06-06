// weewoo.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function triggerWeewoo(username, humanChat, sendWeeWoo) {
    const alert = `🚨 WEEWOO! Possible raid alert by ${username}! 🚨`;

    console.log("[WEEWOO]", alert);

    // Minecraft
    humanChat(alert);

    // Discord with buttons
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('weewoo_yes')
            .setLabel('✅ Real Raid')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId('weewoo_no')
            .setLabel('❌ False Alarm')
            .setStyle(ButtonStyle.Danger)
    );

    sendWeeWoo({ content: alert, components: [row] });
}

module.exports = { triggerWeewoo };
