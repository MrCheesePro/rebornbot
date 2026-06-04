const { startTimer, stopTimer } = require('./wallcheck');
const { sendWall } = require('./discord');
const { getConfig } = require('./config');
const { getTopSessionRaidCheckers, resetTotalRaidChecks } = require('./link');
const { EmbedBuilder } = require('discord.js');

let isTargetFactionHolding = false;

function handleOutpostMessage(msg) {
    const config = getConfig();
    const targetFaction = config.outpost.targetFaction || 'TurtleGang';

    if (msg.includes(`(!) ${targetFaction} have claimed the Raid Outpost!`)) {
        isTargetFactionHolding = true;
        return;
    }

    const claimMatch = msg.match(/\(!\) (.*) have claimed the Raid Outpost!/);
    if (claimMatch) {
        const faction = claimMatch[1].trim();
        if (faction !== targetFaction) {
            isTargetFactionHolding = false;
            stopTimer();
        }
        return;
    }

    if (msg.includes('have lost the Raid Outpost, as they have held control for 12 hours!')) {
        isTargetFactionHolding = false;
        stopTimer();
        
        // Broadcast the top 4 session checkers
        const top4 = getTopSessionRaidCheckers(4);
        let desc = "The Raid Outpost has ended after 12 hours!\n\n**Top 4 Session Raid Checkers:**\n";
        
        if (top4.length === 0) {
            desc += "No raid checks recorded during this session.";
        } else {
            top4.forEach((player, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔹';
                desc += `${medal} <@${player.discordId}> (**${player.mcName}**) - ${player.checks} checks\n`;
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🏰 12-Hour Outpost Ended')
            .setDescription(desc)
            .setColor(0xFFA500)
            .setTimestamp()
            .setFooter({ text: 'Total Raid Checks have been reset.' });
            
        sendWall({ embeds: [embed] });

        // Reset the lifetime total raid checks automatically
        resetTotalRaidChecks();
        return;
    }

    if (msg.includes('A RAID OUTPOST HAS STARTED! Map: Defended.')) {
        if (isTargetFactionHolding) {
            startTimer(sendWall);
        }
        return;
    }
}

module.exports = { handleOutpostMessage };
