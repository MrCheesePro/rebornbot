console.log("Starting bot...");

const { botEvents, humanChat } = require('./mc');
const { startTimer, handleCheck } = require('./wallcheck');
const { sendChat, sendWall, sendWeeWoo, sendWallCheckLog } = require('./discord');
const { startDashboard } = require('./dashboard');
const { generateCode, linkMC, isLinked } = require('./link');
const { triggerWeewoo } = require('./weewoo');
const { handleLCommand } = require('./funny');
const { handlePayment } = require('./tax');
const { handleOutpostMessage } = require('./raidoutpost');
const { getConfig } = require('./config');
require('dotenv').config();

startDashboard();

let isSwitching = false;
let watchdogTimer = null;

function setupBot(botInstance) {
    // --- UPDATED WATCHDOG & SPAWN LOGIC ---
    botInstance.on('spawn', () => {
        // Reset state on every fresh spawn
        isSwitching = false;
        console.log("Bot spawned. Resetting state and waiting 20s for proxy stability...");

        if (watchdogTimer) clearInterval(watchdogTimer);
        
        // LONGER INITIAL DELAY (20 Seconds)
        // This ensures the proxy is 100% ready before we request the sub-server
        setTimeout(() => {
            if (botInstance && botInstance.entity) {
                const config = getConfig();
                const cmd = config.minecraft.serverCommand || '/server forgottenplanet';
                console.log(`20s delay finished. Attempting to join: ${cmd}`);
                botInstance.chat(cmd);
            }
        }, 20000); 

        // LONGER WATCHDOG INTERVAL (60 Seconds)
        // Checking too often can trigger 'socketClosed' if the server is laggy
        watchdogTimer = setInterval(() => {
            if (!isSwitching) {
                const config = getConfig();
                const cmd = config.minecraft.serverCommand || '/server forgottenplanet';
                console.log(`Watchdog: Ensuring bot is on: ${cmd}`);
                botInstance.chat(cmd);
            }
        }, 60000); 
    });

    // --- YOUR ORIGINAL MESSAGE HANDLER ---
    botInstance.on('message', (jsonMsg) => {
        const msg = jsonMsg.toString();
        // Skip logging empty/spam lines to keep console clean
        if (msg.trim().length > 0) console.log("RAW CHAT:", msg);

        // State detection for the Watchdog
        if (msg.includes("Use /server") || msg.includes("official CosmicReborn")) {
            isSwitching = false; 
        }
        if (msg.includes("Sending you to") || msg.includes("transferred") || msg.includes(">> Connecting to")) {
            isSwitching = true; 
        }

        // Handle Raid Outpost automation
        handleOutpostMessage(msg);

        const paymentMatch = msg.match(/\$(\d[\d,]*)\s+has been received from.*?\s([A-Za-z0-9_]+)\.?$/i);
        if (paymentMatch) {
            const amount = parseInt(paymentMatch[1].replace(/,/g, ""));
            const player = paymentMatch[2];
            console.log("TAX PAYMENT DETECTED:", player, amount);
            if (!isLinked(player)) return;
            handlePayment(player, amount);
            return;
        }

        // Delay for the auto-switch message (increased to 10s for stability)
        if (msg.includes("Use /server") || msg.includes("CosmicClient") || msg.includes("official CosmicReborn")) {
            setTimeout(() => {
                if (!isSwitching) {
                    const config = getConfig();
                    const cmd = config.minecraft.serverCommand || '/server forgottenplanet';
                    botInstance.chat(cmd);
                }
            }, 10000);
        }
    });

    // --- YOUR ORIGINAL CHAT HANDLER ---
    botInstance.on('chat', (username, message) => {
        if (username === botInstance.username) return;

        if (
            message.includes('You must link your Discord first') ||
            message.includes('Your Discord is now linked') ||
            message.includes('Invalid or expired code') ||
            (message.includes('must wait') && message.includes('before checking'))
        ) return;

        if (
            message.startsWith('***') ||
            message.includes('altBot') ||
            message.includes('has checked the walls') ||
            message.includes('Minutes Unchecked') ||
            message.includes('Check walls Now')
        ) return;

        const formatted = `<${username}> ${message}`;
        sendChat(formatted);

        const lower = message.toLowerCase();

        // LINK
        const linkMatch = message.match(/link\s+([a-z0-9]{6})/i);
        if (linkMatch) {
            const discordId = linkMC(username, linkMatch[1]);
            botInstance.chat(discordId ? `/r ${username} Your Discord is now linked!` : `/r ${username} Invalid or expired code.`);
            return;
        }

        // WEEWOO
        if (lower.includes('weewoo')) {
            if (!isLinked(username)) {
                botInstance.chat(`/r You must link your Discord first using: ./msg ${botInstance.username} link CODE`);
                return;
            }
            triggerWeewoo(username, humanChat, sendWeeWoo);
            return;
        }

        // RAIDCHECK (Prioritized)
        if (lower.includes('raid')) {
            if (!isLinked(username)) {
                botInstance.chat(`/r You must link your Discord first using: ./msg ${botInstance.username} link CODE`);
                return;
            }
            const checkData = handleCheck(username, sendWall, 'raidChecks');
            if (checkData) {
                sendWallCheckLog(username, checkData.wallTotal, checkData.raidTotal, checkData.elapsed, 'raidChecks');
            }
            return; // Stop here so it doesn't also trigger a standard wall check
        }

        // WALLS (Strict check recommended but kept your 'includes' logic as requested)
        if (lower.includes('walls') || lower.includes('wall') || lower.includes('check')) {
            if (!isLinked(username)) {
                botInstance.chat(`/r You must link your Discord first using: ./msg ${botInstance.username} link CODE`);
                return;
            }
            const checkData = handleCheck(username, sendWall);
            if (checkData) {
                sendWallCheckLog(username, checkData.wallTotal, checkData.raidTotal, checkData.elapsed);
            }
        }

        // L
        if (lower.startsWith('l ')) {
            if (isLinked(username)) {
                const args = message.split(/\s+/).slice(1);
                handleLCommand(username, args);
            }
        }
    });

    botInstance.on('error', (err) => console.error('Bot error:', err));
    botInstance.on('end', () => { if (watchdogTimer) clearInterval(watchdogTimer); });
}

// Re-apply logic every time a new bot instance is created in mc.js
botEvents.on('newBot', (newBotInstance) => {
    console.log("Applying logic to new bot instance...");
    setupBot(newBotInstance);
});
