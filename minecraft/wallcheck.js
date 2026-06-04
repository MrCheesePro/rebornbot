const { bot, humanChat } = require('./mc');
const { incrementChecks, getChecks, getRaidChecks } = require('./link');
const { EmbedBuilder } = require('discord.js');
const { getConfig } = require('./config');

let lastCheck = Date.now();
let lastChecker = null;
let timerId = null;
let counts = {}; // export this so index.js can use it

const WALL_CHECK_ROLE_ID = '1468513791921750150';
const CHECK_COOLDOWN_MS = 60 * 1000;
let lastPlayerCheckTime = {};
const PING_INTERVAL_MINUTES = 15;

function minutesPassed() {
    return Math.floor((Date.now() - lastCheck) / 60000);
}

// Timer that announces every 1 minute
function startTimer(discordSend) {
    if (timerId) return timerId;

    timerId = setInterval(() => {
        const mins = minutesPassed(); // minutes since last check

        if (mins > 0) { // optional: only announce after 1 min
            const config = getConfig();
            const rawMsg = config.minecraft.reminderMessage || 'Check walls Now & /msg captunnel! Minutes Unchecked: {mins}';
            const msg = rawMsg.replace('{mins}', mins);
            
            humanChat(msg);
            
            const embed = new EmbedBuilder()
                .setTitle('Wall Check Alert!')
                .setDescription(`Minutes Unchecked: **${mins}**` + (lastChecker ? `\nLast Checker: **${lastChecker}** (Total Checks: **${getChecks(lastChecker)}**)` : ''))
                .setColor(0xFF0000)
                .setTimestamp();

            // Ping only if at least 15 minutes have passed since last check
            if (discordSend && mins > 0 && mins % PING_INTERVAL_MINUTES === 0) {
                discordSend({
                    embeds: [embed],
                    content: `<@&${WALL_CHECK_ROLE_ID}>`
                });
            } else if (discordSend) {
                discordSend({ embeds: [embed] });
            }
        }
    }, 60 * 1000); // every 1 minute

    return timerId;
}

function stopTimer() {
    if (timerId) {
        clearInterval(timerId);
        timerId = null;
    }
}

// Increment counter and reset timer
function handleCheck(player, discordSend, type = 'checks') {
    const now = Date.now();

    // Cooldown check
    if (lastPlayerCheckTime[player] && now - lastPlayerCheckTime[player] < CHECK_COOLDOWN_MS) {
        const secondsLeft = Math.ceil((CHECK_COOLDOWN_MS - (now - lastPlayerCheckTime[player])) / 1000);
        const msg = `/r ${player}, you must wait ${secondsLeft}s before checking again.`;
        humanChat(msg);
        return null;
    }

    const elapsed = now - lastCheck;
    
    // Passed cooldown, allow check
    lastPlayerCheckTime[player] = now;

    incrementChecks(player, type); // persistent count in links.json
    const wallTotal = getChecks(player);
    const raidTotal = getRaidChecks(player);
    
    lastCheck = now;
    lastChecker = player;

    const action = type === 'raidChecks' ? 'RAID CHECK' : 'WALL CHECK';
    const msg = `(!) ${player} ${action} recorded! [Wall: ${wallTotal} | Raid: ${raidTotal}]`;
    humanChat(msg); // announce publicly in MC
    
    if (discordSend) {
        const title = type === 'raidChecks' ? 'Raid Checked!' : 'Wall Checked!';
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(`${player} has recorded a ${action}!\n\n**Raid Checks:** ${raidTotal}\n**Wall Checks:** ${wallTotal}`)
            .setColor(type === 'raidChecks' ? 0x9B59B6 : 0x00FF00)
            .setTimestamp();
        discordSend({ embeds: [embed] });
    }

    return { wallTotal, raidTotal, elapsed };
}

function isTimerRunning() {
    return timerId !== null;
}

module.exports = { startTimer, stopTimer, handleCheck, isTimerRunning, counts, WALL_CHECK_ROLE_ID };
