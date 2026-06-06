const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { generateCode, getLinkedMC, getLeaderboard, unlinkDiscord, changeIGN, resetAllChecks, resetRaidChecks, getAllLinks, unlinkByMC } = require('../commands/link'); 
const { startTimer, stopTimer, WALL_CHECK_ROLE_ID } = require('../functions/wallcheck');
const { startTax, stopTax, handlePayment } = require('../commands/tax');
const { triggerWeewoo } = require('../commands/weewoo');
const mc = require('./mc');
const { getConfig } = require('../functions/config');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

let chatChannel;
let wallChannel;
let weewooChannel;
let raidChannel;
let ftopChannel;
let taxChannel;
let logsChannel;
let raidBagChannel;
let timerRunning = false;
let raidInterval = null;

// F Top Variables
let ftopInterval = null;
let ftopData = [];
let discordStatus = {
    state: 'idle',
    message: 'Waiting for a Discord token.',
    userTag: null,
    lastError: null
};
let loginPromise = null;
let activeToken = null;

function getBot() {
    return mc.bot;
}

function humanChat(message) {
    mc.humanChat(message);
}

function getDiscordConfig() {
    return getConfig().discord;
}

function updateDiscordStatus(nextStatus) {
    discordStatus = {
        ...discordStatus,
        ...nextStatus
    };
}

function clearConfiguredChannels() {
    chatChannel = null;
    wallChannel = null;
    weewooChannel = null;
    raidChannel = null;
    ftopChannel = null;
    taxChannel = null;
    logsChannel = null;
    raidBagChannel = null;
}

async function fetchConfiguredChannel(channelId) {
    if (!channelId || !client.isReady()) return null;
    try {
        return await client.channels.fetch(channelId);
    } catch (error) {
        console.warn(`Could not fetch Discord channel ${channelId}:`, error.message);
        return null;
    }
}

async function refreshConfiguredChannels() {
    if (!client.isReady()) {
        clearConfiguredChannels();
        return;
    }

    const { channelIds } = getDiscordConfig();
    chatChannel = await fetchConfiguredChannel(channelIds.chat);
    wallChannel = await fetchConfiguredChannel(channelIds.wall);
    weewooChannel = await fetchConfiguredChannel(channelIds.weewoo);
    raidChannel = await fetchConfiguredChannel(channelIds.raid);
    ftopChannel = await fetchConfiguredChannel(channelIds.ftop);
    taxChannel = await fetchConfiguredChannel(channelIds.tax);
    logsChannel = await fetchConfiguredChannel(channelIds.logs);
    raidBagChannel = await fetchConfiguredChannel(channelIds.raidBag);
}

function hasAdminAccess(message) {
    if (!message.guild || !message.member) return false;

    const { adminUserIds, adminRoleIds } = getDiscordConfig();
    const adminUsers = new Set(adminUserIds);
    const adminRoles = new Set(adminRoleIds);

    if (adminUsers.has(message.author.id)) return true;

    const hasConfiguredRole = message.member.roles.cache.some(role => adminRoles.has(role.id));
    if (hasConfiguredRole) return true;

    return message.member.permissions.has(PermissionsBitField.Flags.Administrator);
}

client.on('ready', async () => {
    console.log(`Discord connected as ${client.user.tag}`);

    updateDiscordStatus({
        state: 'ready',
        message: 'Connected to Discord.',
        userTag: client.user.tag,
        lastError: null
    });
    await refreshConfiguredChannels();
});

client.on('error', error => {
    console.error('Discord client error:', error);
    updateDiscordStatus({
        state: 'error',
        message: error.message,
        lastError: error.message
    });
});

client.on('shardDisconnect', () => {
    updateDiscordStatus({
        state: 'idle',
        message: 'Discord connection closed.',
        userTag: null
    });
    clearConfiguredChannels();
});

async function reloadDiscordFromConfig() {
    const { token } = getDiscordConfig();

    if (!token) {
        if (client.isReady()) client.destroy();
        activeToken = null;
        clearConfiguredChannels();
        updateDiscordStatus({
            state: 'idle',
            message: 'Waiting for a Discord token.',
            userTag: null,
            lastError: null
        });
        return false;
    }

    if (loginPromise) return loginPromise;

    if (client.isReady() && activeToken === token) {
        await refreshConfiguredChannels();
        updateDiscordStatus({
            state: 'ready',
            message: 'Connected to Discord.',
            userTag: client.user ? client.user.tag : null,
            lastError: null
        });
        return true;
    }

    if (client.isReady()) {
        client.destroy();
        clearConfiguredChannels();
    }

    activeToken = token;
    updateDiscordStatus({
        state: 'connecting',
        message: 'Connecting to Discord...',
        userTag: null,
        lastError: null
    });

    loginPromise = client.login(token)
        .then(async () => {
            await refreshConfiguredChannels();
            updateDiscordStatus({
                state: 'ready',
                message: 'Connected to Discord.',
                userTag: client.user ? client.user.tag : null,
                lastError: null
            });
            return true;
        })
        .catch(error => {
            console.error('Discord login failed:', error);
            activeToken = null;
            clearConfiguredChannels();
            try {
                client.destroy();
            } catch (destroyError) {
                console.error('Discord client destroy failed:', destroyError);
            }
            updateDiscordStatus({
                state: 'error',
                message: error.message,
                userTag: null,
                lastError: error.message
            });
            return false;
        })
        .finally(() => {
            loginPromise = null;
        });

    return loginPromise;
}

function getDiscordStatus() {
    return { ...discordStatus };
}

async function ensureDiscordReady() {
    if (!client.isReady()) {
        throw new Error('Discord bot is not connected. Save a valid token first.');
    }
}

async function listDiscordGuilds() {
    await ensureDiscordReady();
    const fetchedGuilds = await client.guilds.fetch();
    const guilds = [];

    for (const guildStub of fetchedGuilds.values()) {
        const guild = await guildStub.fetch();
        guilds.push({
            id: guild.id,
            name: guild.name
        });
    }

    guilds.sort((a, b) => a.name.localeCompare(b.name));
    return guilds;
}

async function listDiscordChannels(guildId) {
    await ensureDiscordReady();

    if (!guildId) {
        throw new Error('Pick a Discord server first.');
    }

    const guild = await client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();

    return Array.from(channels.values())
        .filter(channel => channel && channel.isTextBased() && (!channel.isThread || !channel.isThread()))
        .map(channel => ({
            id: channel.id,
            name: `#${channel.name}`
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function sendChat(msg) {
    if (chatChannel) chatChannel.send(msg).catch(console.error);
}

function sendWall(msg) {
    if (wallChannel) wallChannel.send(msg).catch(console.error);
}

function sendWeeWoo(msg) {
    if (weewooChannel) weewooChannel.send(msg).catch(console.error);
}

function sendFTop(msg) {
    if (ftopChannel) ftopChannel.send(msg).catch(console.error);
}

function sendTax(msg) {
    if (taxChannel) taxChannel.send(msg).catch(console.error);
}

function sendLog(msg) {
    if (logsChannel) logsChannel.send(msg).catch(console.error);
}

function sendWallCheckLog(player, wallTotal, raidTotal, elapsed, type = 'checks') {
    if (!logsChannel) return;

    const now = new Date();
    const timestamp = now.getFullYear() + '/' + 
        String(now.getMonth() + 1).padStart(2, '0') + '/' + 
        String(now.getDate()).padStart(2, '0') + ' ' + 
        String(now.getHours()).padStart(2, '0') + ':' + 
        String(now.getMinutes()).padStart(2, '0') + ':' + 
        String(now.getSeconds()).padStart(2, '0');

    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);

    let duration = "";
    if (hours > 0) duration += `${hours}h `;
    if (minutes > 0) duration += `${minutes}m `;
    duration += `${seconds}s`;

    const avatarURL = `https://mc-heads.net/avatar/${player}/256`;
    const action = type === 'raidChecks' ? 'recorded a RAID CHECK.' : 'recorded a WALL CHECK.';
    const color = type === 'raidChecks' ? 0x9B59B6 : 0x00FFFF;

    const embed = new EmbedBuilder()
        .setAuthor({ name: `${player} ${action}`, iconURL: avatarURL })
        .addFields(
            { name: "Clear at", value: `\`${timestamp}\``, inline: false },
            { name: "Time since last check", value: `\`${duration}\``, inline: true },
            { name: "Raid Checks", value: `\`${raidTotal}\``, inline: true },
            { name: "Wall Checks", value: `\`${wallTotal}\``, inline: true }
        )
        .setColor(color)
        .setFooter({ text: 'noobtech' })
        .setTimestamp();

    logsChannel.send({ embeds: [embed] }).catch(console.error);
}

function runFTop() {
    const bot = getBot();

    if (!bot) {
        console.log("MC Bot isn't logged in.");
        return;
    }

    ftopData = [];

    bot.chat("/f top");

    const collector = (jsonMsg) => {

        const message = jsonMsg.toString().trim();
        const match = message.match(/^(\d+)\.\s+(.+?)\s+-\s+([\d,]+)\s+Faction Points\s+\(\+?([\d,]+)\)/i);

        if (match) {
            ftopData.push({
                rank: parseInt(match[1]),
                name: match[2],
                total: match[3],
                green: match[4]
            });
        }
    };

    bot.on('message', collector);

    setTimeout(() => {
        bot.removeListener('message', collector);

        if (ftopData.length === 0) {
            console.log("No FTop data collected.");
            return;
        }

        sendFTopEmbed();
    }, 8000);
}

function sendFTopEmbed() {
    if (!ftopChannel) return;
    if (ftopData.length === 0) {
        console.log("No FTop data to send.");
        return;
    }

    // Sort by rank
    ftopData.sort((a, b) => a.rank - b.rank);

    const pad = (str, length) => {
        str = String(str);
        return str.length >= length
            ? str.slice(0, length)
            : str + " ".repeat(length - str.length);
    };

    let table =
        pad("#", 4) +
        pad("Faction", 14) +
        pad("Total", 10) +
        pad("Weekly", 10) +
        "Diff\n";

    table += "-".repeat(49) + "\n";

    const top10 = ftopData.slice(0, 10);

    for (let i = 0; i < top10.length; i++) {
        const current = top10[i];

        const currentTotal = parseInt(current.total.replace(/,/g, ""));
        let diff = "-";

        if (i < top10.length - 1) {
            const nextTotal = parseInt(top10[i + 1].total.replace(/,/g, ""));
            const difference = currentTotal - nextTotal;
            diff = "+" + difference.toLocaleString();
        }

        table +=
            pad(current.rank + ".", 4) +
            pad(current.name, 14) +
            pad(current.total, 10) +
            pad(current.green, 10) +
            diff +
            "\n";
    }

    const embed = new EmbedBuilder()
        .setTitle("Current F Top Leaderboard")
        .setColor(0x9B59B6)
        .setDescription("```" + table + "```")
        .setTimestamp();

    ftopChannel.send({ embeds: [embed] }).catch(console.error);
}

client.on('messageCreate', async message => {
    // Ignore bot messages
    if (message.author.bot) return;

    // ---- HELP COMMAND ----
    if (message.content.toLowerCase() === '!help') {
        const embed = new EmbedBuilder()
            .setTitle('NOOBTECH COMMANDS')
            .setColor(0x0099FF)
            .setDescription('noobtech commands')
            .addFields(
                { name: '!link', value: 'Link your Discord account to your Minecraft account.' },
                { name: '!unlink', value: 'Unlink your Discord account to your Minecraft account.' },
                { name: '!changelink <newIGN>', value: 'Replaces your current Minecraft account with the newIGN.' },
                { name: '!leaderboard or !lb', value: 'Show the wall check leaderboard.' },
                { name: '!weewoo', value: 'Trigger a raid alert.' },
                { name: '!stats', value: 'Show your stats or another player\'s stats. Usage: `!stats` or `!stats <mcName>`' },
                { name: '!start', value: 'Start the wall check timer.' },
                { name: '!stop', value: 'Stop the wall check timer.' },
                { name: '!ftop', value: 'Start ftop listing' },
                { name: '!ftopStop', value: 'Stop ftop listing' },
                { name: '!tax goal <amount> <hours>', value: 'Start a tax goal. Example: `!tax goal 1000000 24` (1 million goal, 24 hour duration)' },
                { name: '!raidbag', value: 'Post the Raid Bag collection question.' }
            )
            .setFooter({ text: 'noobtech' })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
        return;
    }

    // ---- START WALL TIMER COMMAND ----
    if (message.content.toLowerCase() === '!start') {
        if (timerRunning) {
            return message.reply("⏱Wall timer is already running.");
        }
    
        startTimer(sendWall);
        timerRunning = true;
        return message.reply("Wall timer started.");
    }

    // ---- STOP WALL TIMER COMMAND ----
    if (message.content.toLowerCase() === '!stop') {
        if (!timerRunning) {
            return message.reply("Wall timer is not running.");
        }
    
        stopTimer();
        timerRunning = false;
        return message.reply("Wall timer stopped.");
    }

    // ---- RAID BAG COMMAND ----
    if (message.content.toLowerCase() === '!raidbag') {
        if (!hasAdminAccess(message)) return;

        const embed = new EmbedBuilder()
            .setTitle('Raid Outpost Collection')
            .setDescription('Did you collect a Raid Bag?')
            .setColor(0xFFA500)
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('raidbag_yes')
                    .setLabel('Yes')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('raidbag_no')
                    .setLabel('No')
                    .setStyle(ButtonStyle.Danger)
            );

        message.channel.send({ embeds: [embed], components: [row] });
        return;
    }

    // ---- MESSAGE COMMAND ----
    if (message.content.startsWith('!say ')) {
        const bot = getBot();
        if (!bot) {
            return message.reply("Minecraft bot is not connected right now.");
        }

        const text = message.content.slice(5); // remove "!say "
        bot.chat(text); // send to Minecraft
        message.reply("Sent to Minecraft: " + text);
    }
  
    // ---- LINK COMMAND ----
    if (message.content.toLowerCase() === '!link') {
        const discordId = message.author.id;

        const linkedMC = getLinkedMC(discordId);
        if (linkedMC) {
            message.reply(`Your Discord is already linked to Minecraft user **${linkedMC}**.`);
            return;
        }

        const code = generateCode(discordId);

        try {
            // Send a DM (private message) to the user
            await message.author.send(
                `Your linking code is: **${code}**. DM this code to the Minecraft bot to link your account. (./msg captunnel link ${code})`
            );

            // Optional: react in the channel to show the bot sent a DM
            message.react('✅');
        } catch (err) {
            // Could not send DM (maybe user has DMs off)
            message.reply(
                "I couldn't DM you! Please make sure your DMs are open and try again."
            );
        }

        return; // stop further processing
    }

    // ---- UNLINK COMMAND WITH CONFIRMATION ----
    if (message.content.toLowerCase() === '!unlink') {
        const discordId = message.author.id;
        const linkedMC = getLinkedMC(discordId);

        if (!linkedMC) {
            return message.reply("You are not linked.");
        }

        const confirmMsg = await message.reply(
            `Are you sure you want to unlink **${linkedMC}**?\nReact with ✅ within 30 seconds to confirm.`
        );

        await confirmMsg.react('✅');

        const filter = (reaction, user) =>
            reaction.emoji.name === '✅' && user.id === discordId;

        const collector = confirmMsg.createReactionCollector({
            filter,
            time: 30000,
            max: 1
        });

        collector.on('collect', () => {
            unlinkDiscord(discordId);
            confirmMsg.edit(`Successfully unlinked **${linkedMC}** from your Discord.`);
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                confirmMsg.edit("❌ Unlink request expired.");
            }
        });
    }

    // ---- CHANGE LINK COMMAND ----
    if (message.content.toLowerCase().startsWith('!changelink')) {
        const args = message.content.split(" ");

        if (args.length < 2) {
            return message.reply("Usage: `!changelink <newIGN>`");
        }

        const discordId = message.author.id;
        const newIGN = args[1];

        const linkedMC = getLinkedMC(discordId);
        if (!linkedMC) {
            return message.reply("You must link first using !link.");
        }

        const success = changeIGN(discordId, newIGN);

        if (!success) {
            return message.reply("That IGN is already linked to another Discord account.");
        }
    
        return message.reply(`Your Minecraft account has been updated from **${linkedMC}** to **${newIGN}**.`);
    }

    // ---- LINK LIST COMMAND ---- 
    if (message.content.toLowerCase() === '!linklist') {
        if (!hasAdminAccess(message)) {
            return message.reply("You don't have permission to use this command.");
        }

        const players = Object.values(getAllLinks())
            .filter(entry => entry.mc)
            .sort((a, b) => (a.mc || "").localeCompare(b.mc || ""));

        if (players.length === 0) {
            return message.reply("No linked players found.");
        }

        const pad = (str, length) => {
            str = String(str);
            return str.length >= length
                ? str.slice(0, length)
                : str + " ".repeat(length - str.length);
        };

        const NUM_WIDTH = 4;
        const IGN_WIDTH = 16;
        const DISCORD_WIDTH = 22;

        let table =
            pad("#", NUM_WIDTH) +
            pad("IGN", IGN_WIDTH) +
            pad("Discord", DISCORD_WIDTH) +
            "\n";

        table += "-".repeat(NUM_WIDTH + IGN_WIDTH + DISCORD_WIDTH) + "\n";

        for (let i = 0; i < players.length; i++) {

            const entry = players[i];
            const ign = entry.mc;

            let discordName = "Not Linked";

            if (entry.discordId) {
                try {
                    const user = await client.users.fetch(entry.discordId);
                    if (user) discordName = user.username;
                } catch {
                    discordName = "Unknown User";
                }
            }

            table +=
                pad((i + 1) + ".", NUM_WIDTH) +
                pad(ign, IGN_WIDTH) +
                pad(discordName, DISCORD_WIDTH) +
                "\n";
        }

        const embed = new EmbedBuilder()
            .setTitle(`Link List (${players.length})`)
            .setColor(0x3498DB)
            .setDescription("```" + table + "```")
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });
        return;
    }

    // ---- RESET CHECKS COMMAND ----
    if (message.content.toLowerCase() === '!resetchecks') {
        if (!hasAdminAccess(message)) {
            return message.reply("You don't have permission to use this command.");
        }

        const confirmMsg = await message.reply(
            "⚠️ **Are you sure?** This will reset all wall checks to 0. React with ✅ to confirm."
        );
        await confirmMsg.react('✅');

        const filter = (reaction, user) => reaction.emoji.name === '✅' && user.id === message.author.id;
        const collector = confirmMsg.createReactionCollector({ filter, time: 15000, max: 1 });

        collector.on('collect', async () => {
            try {
                const backupFileName = resetAllChecks();
                const backupPath = path.join(__dirname, '../database/', backupFileName);

                await message.reply({
                    content: `✅ All wall checks reset to 0.`,
                    files: [backupPath] // This uploads the old records as a file you can download
                });
            } catch (err) {
                console.error(err);
                message.reply("An error occurred while resetting checks.");
            }
        });
    }

    // ---- LEADERBOARD COMMAND ----
    if (message.content.toLowerCase() === '!leaderboard' || message.content.toLowerCase() === '!lb') {
        try {
            const leaderboard = getLeaderboard();
            
            if (leaderboard.length === 0) {
                await message.reply('No wall checks recorded yet! Check walls in-game to appear on the leaderboard.');
                return;
            }
            
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🏆 Wall Check Leaderboard')
                .setColor(0x00AE86)
                .setDescription('Top wall checkers on Forgotten Planet')
                .setTimestamp()
                .setFooter({ text: 'Updated just now' });
            
            // Add top 10 to embed fields
            const topPlayers = leaderboard.slice(0, 10);
            
            for (let index = 0; index < topPlayers.length; index++) {
                const player = topPlayers[index];
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔹';
            
                let discordName = 'mystery man';
                try {
                    const discordUser = await client.users.fetch(player.discordId);
                    if (discordUser) discordName = discordUser.username;
                } catch {}
            
                embed.addFields({
                    name: `${medal} ${index + 1}. ${player.mcName}`,
                    value: `**Checks:** ${player.checks}\n**Discord:** ${discordName}`,
                    inline: false
                });
            }
            
            // Add total stats
            const totalChecks = leaderboard.reduce((sum, player) => sum + player.checks, 0);
            const totalPlayers = leaderboard.length;
            
            embed.addFields({
                name: '📊 Overall Stats',
                value: `**Total Players:** ${totalPlayers}\n**Total Checks:** ${totalChecks}`,
                inline: false
            });
            
            await message.channel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error displaying leaderboard:', error);
            await message.channel.send('There was an error loading the leaderboard. Please try again later.');
        }
        return;
    }

    // ---- WEEWOO COMMAND ----
    if (message.content.toLowerCase() === '!weewoo') {
        const mcName = getLinkedMC(message.author.id);

        if (!mcName) {
            message.reply("You must link your Minecraft account first using !link.");
            return;
        }

        message.delete().catch(() => {});
        triggerWeewoo(mcName, humanChat, sendWeeWoo);
        return;
    }

    // ---- FTOP START ----
    if (message.content.toLowerCase() === '!ftop') {
        if (ftopInterval) {
            return message.reply("Ftop already running.");
        }

        message.reply("Starting f top data tracker (updates every hour).");

        runFTop();

        ftopInterval = setInterval(() => {
            runFTop();
        }, 60 * 60 * 1000); // every hour

        return;
    }

    // ---- FTOP STOP ----
    if (message.content.toLowerCase() === '!ftopstop') {
        if (!ftopInterval) {
            return message.reply("Ftop is not running.");
        }

        clearInterval(ftopInterval);
        ftopInterval = null;

        return message.reply("Stopped f top data tracker.");
    }

    // ---- STATS COMMAND ----
    if (message.content.toLowerCase().startsWith('!stats')) {

        const links = getAllLinks();

        const args = message.content.split(" ");
        let targetMC = null;
        let userData = null;

        // If no name provided → show YOUR stats
        if (args.length === 1) {
            const discordId = message.author.id;

            for (const key in links) {
                if (links[key].discordId === discordId) {
                    userData = links[key];
                    targetMC = links[key].mc;
                    break;
                }
            }

            if (!userData) {
                return message.reply("You are not linked. Use `!link` first.");
            }
        } else {
            // Show stats for specified MC name
            targetMC = args[1];

            for (const key in links) {
                if (links[key].mc.toLowerCase() === targetMC.toLowerCase()) {
                    userData = links[key];
                    break;
                }
            }

            if (!userData) {
                return message.reply("Player not found.");
            }
        }

        // Try to fetch Discord user
        // Always use Minecraft head
        const avatarURL = `https://mc-heads.net/avatar/${targetMC}/256`;

        // Show Discord mention if linked
        const discordDisplay = userData.discordId
            ? `<@${userData.discordId}>`
            : "Not Linked";

        const embed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setTitle(`${targetMC}'s Stats`)
            .setThumbnail(avatarURL)
            .addFields(
                { name: "IGN", value: `\`${targetMC}\``, inline: false },
                { name: "Total Wallchecks", value: `\`${userData.checks || 0}\``, inline: true },
                { name: "Total Raidchecks", value: `\`${userData.raidChecks || 0}\``, inline: true },
                { name: "Discord", value: discordDisplay, inline: true }
            )
            .setFooter({ text: "noobtech" })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }
    if (message.content.startsWith('!tax goal')) {
        const args = message.content.split(" ");
    
        if (args.length < 4) {
            return message.reply("Usage: !tax goal <amount> <hours>");
        }
    
        const amount = args[2];
        const hours = parseInt(args[3]);
    
        const started = startTax(amount, hours, taxChannel, getAllLinks());
    
        if (!started) {
            return message.reply("A tax is already running.");
        }
    
        message.reply("Tax goal started.");
    }    
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'weewoo_yes') {
        if (raidInterval) {
            await interaction.reply({ content: '🚨 Raid alert already active!', ephemeral: true });
            return;
        }

        await interaction.deferUpdate();

        raidInterval = setInterval(() => {
            if (!raidChannel) return;

            const embed = new EmbedBuilder()
                .setTitle('🚨 RAID IN PROGRESS 🚨')
                .setDescription('**WE ARE GETTING RAIDED!**\nCheck walls immediately and get online.')
                .setColor(0xFF0000)
                .setTimestamp()
                .setFooter({ text: 'noobtech' });

            raidChannel.send({ content: `<@&${WALL_CHECK_ROLE_ID}>`, embeds: [embed] });
        }, 5000);
    }

    if (interaction.customId === 'weewoo_no') {
        if (!raidInterval) {
            await interaction.reply({ content: '🟢 No active raid alert.', ephemeral: true });
            return;
        }

        clearInterval(raidInterval);
        raidInterval = null;

        if (raidChannel) {
            const endedEmbed = new EmbedBuilder()
                .setTitle('🟢 RAID ENDED')
                .setDescription('All clear. The raid has been marked as a false alarm or resolved.')
                .setColor(0x00FF00)
                .setTimestamp();

            raidChannel.send({ embeds: [endedEmbed] });
        }

        await interaction.reply({ content: '🟢 Raid ended. Alerts stopped.', ephemeral: false });
    }

    if (interaction.customId === 'raidbag_yes') {
        resetRaidChecks();
        await interaction.reply({ content: '✅ Raid check count has been reset!', ephemeral: false });
    }

    if (interaction.customId === 'raidbag_no') {
        await interaction.reply({ content: '❌ No reset performed.', ephemeral: true });
    }
});

reloadDiscordFromConfig().catch(error => {
    console.error('Initial Discord connection failed:', error);
});

module.exports = {
    client,
    sendChat,
    sendWall,
    sendWeeWoo,
    sendTax,
    sendLog,
    sendWallCheckLog,
    getDiscordStatus,
    listDiscordGuilds,
    listDiscordChannels,
    reloadDiscordFromConfig,
    unlinkByMC
};
