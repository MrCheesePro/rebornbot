const { EmbedBuilder } = require('discord.js');

let taxGoal = 0;
let taxDeadline = 0;
let perPersonAmount = 0;
let deadlineTimeout = null;

let taxActive = false;
let taxExpired = false;

let members = new Map();
let totalCollected = 0;

let taxMessage = null;
let taxChannelRef = null;

const MEMBER_COUNT = 25;

// -------------------------
function parseAmount(input) {
    input = input.toLowerCase().replace(/,/g, "");

    if (input.endsWith("m")) return parseFloat(input) * 1_000_000;
    if (input.endsWith("k")) return parseFloat(input) * 1_000;

    return parseInt(input);
}

// -------------------------
function startTax(goalInput, hours, taxChannel, linksData) {
    if (taxActive) return false;

    taxActive = true;
    taxExpired = false;

    taxGoal = parseAmount(goalInput);
    taxDeadline = Date.now() + (hours * 60 * 60 * 1000);
    perPersonAmount = Math.ceil(taxGoal / MEMBER_COUNT);
    totalCollected = 0;

    members.clear();
    taxChannelRef = taxChannel;

    for (const key in linksData) {
        const user = linksData[key];
        if (user.discordId) {
            members.set(user.discordId, {
                mc: user.mc,
                paidAmount: 0
            });
        }
    }

    // 🔥 Start deadline timer
    deadlineTimeout = setTimeout(async () => {
        if (taxActive) {
            taxExpired = true;
            taxActive = false;

            await sendOrUpdateEmbed(false);

            taxChannelRef.send(
                "```tax deadline has been reached```"
            );
        }
    }, hours * 60 * 60 * 1000);

    sendOrUpdateEmbed(true);
    return true;
}

// -------------------------
function stopTax() {
    taxActive = false;
    taxExpired = false;

    if (deadlineTimeout) {
        clearTimeout(deadlineTimeout);
        deadlineTimeout = null;
    }

    taxMessage = null;
}

// -------------------------
async function handlePayment(mcName, amount) {
    if (!taxActive || taxExpired) return;

    for (const [discordId, user] of members.entries()) {
        if (user.mc.toLowerCase() === mcName.toLowerCase()) {

            user.paidAmount += amount;
            totalCollected += amount;

            const remaining = Math.max(perPersonAmount - user.paidAmount, 0);
            const now = new Date();

            const day = now.toLocaleDateString("en-US", {
                month: "short",
                day: "2-digit",
                year: "numeric"
            });

            const time = now.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            });

            const timestamp = `${day} | ${time}`;

            let logLine =
                remaining <= 0
                    ? `[${timestamp}] ${mcName} has paid $${amount.toLocaleString()} (COMPLETE)`
                    : `[${timestamp}] ${mcName} has paid $${amount.toLocaleString()} | Remaining: $${remaining.toLocaleString()}`;

            taxChannelRef.send(`\`\`\`${logLine}\`\`\``);

            await sendOrUpdateEmbed(false);
            break;
        }
    }

    if (totalCollected >= taxGoal) {
        taxChannelRef.send(
            `\`\`\`tax goal has been completed - $${totalCollected.toLocaleString()}\`\`\``
        );
        stopTax();
    }
}

// -------------------------
async function sendOrUpdateEmbed(isFirstSend) {
    if (!taxChannelRef) return;

    const pad = (str, length) => {
        str = String(str);
        return str.length >= length
            ? str
            : str + " ".repeat(length - str.length);
    };

    const now = Date.now();
    const timeLeft = Math.max(taxDeadline - now, 0);

    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

    const countdown =
        taxExpired
            ? "EXPIRED"
            : `${hours}h ${minutes}m`;

    const progressPercent =
        taxGoal > 0
            ? Math.min(Math.floor((totalCollected / taxGoal) * 100), 100)
            : 0;

    // 🔥 Progress Bar
    const barLength = 20;
    const filled = Math.round((progressPercent / 100) * barLength);
    const progressBar =
        "█".repeat(filled) + "░".repeat(barLength - filled);

    let statusText = "Active";
    if (taxExpired) statusText = "Deadline Reached";
    if (!taxActive && !taxExpired) statusText = "No Active Tax";

    // ---------------------------
    // 🔥 SORT MEMBERS
    // ---------------------------
    const paid = [];
    const partial = [];
    const unpaid = [];

    for (const [discordId, user] of members.entries()) {
        if (user.paidAmount >= perPersonAmount) {
            paid.push(user);
        } else if (user.paidAmount > 0) {
            partial.push(user);
        } else {
            unpaid.push(user);
        }
    }

    // Optional: alphabetically sort inside each group
    const sorter = (a, b) => a.mc.localeCompare(b.mc);
    paid.sort(sorter);
    partial.sort(sorter);
    unpaid.sort(sorter);

    const ordered = [...paid, ...partial, ...unpaid];

    // ---------------------------
    // Build member lines
    // ---------------------------
    const memberLines = ordered.map(user => {
        let symbol = "❌";
        if (user.paidAmount >= perPersonAmount) symbol = "✅";
        else if (user.paidAmount > 0) symbol = "➖";

        return `${symbol} ${pad(user.mc, 18)} $${(user.paidAmount || 0).toLocaleString()}`;
    });

    const header =
        `Status      : ${statusText}\n` +
        `Goal        : $${taxGoal.toLocaleString()}\n` +
        `Per Person  : $${perPersonAmount.toLocaleString()}\n` +
        `Collected   : $${totalCollected.toLocaleString()} (${progressPercent}%)\n` +
        `Time Left   : ${countdown}\n` +
        `Progress    : [${progressBar}]\n`;

    const divider = "-".repeat(45);

    const table = `${header}\n${divider}\n${memberLines.join("\n")}`;

    const embed = new EmbedBuilder()
        .setColor(taxExpired ? 0xFF0000 : 0xE67E22)
        .setTitle("noobtech tax collector")
        .setDescription("```" + table + "```")
        .setTimestamp();

    if (isFirstSend || !taxMessage) {
        taxMessage = await taxChannelRef.send({ embeds: [embed] });
    } else {
        await taxMessage.edit({ embeds: [embed] });
    }
}

module.exports = {
    startTax,
    stopTax,
    handlePayment
};
