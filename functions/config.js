const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CONFIG_PATH = path.join(__dirname, '../database/bot-config.json');

const DEFAULT_CONFIG = {
    web: {
        host: process.env.WEB_HOST || '0.0.0.0',
        port: parsePort(process.env.PORT || process.env.WEB_PORT, 3000)
    },
    discord: {
        token: process.env.DISCORD_TOKEN || '',
        selectedGuildId: '',
        adminUserIds: splitCsv(process.env.ADMIN_USER_IDS),
        adminRoleIds: splitCsv(process.env.ADMIN_ROLE_IDS),
        channelIds: {
            chat: '1462933836886179901',
            wall: '1462422656203751434',
            weewoo: '1462933707374596201',
            raid: '1462422628399845470',
            ftop: '1473584762907005029',
            tax: '1473612740693332150',
            logs: '',
            raidBag: ''
        }
    },
    minecraft: {
        reminderMessage: 'Check walls Now & /msg captunnel! Minutes Unchecked: {mins}',
        serverCommand: '/server forgottenplanet'
    },
    outpost: {
        targetFaction: 'TurtleGang',
        isHolding: false
    }
};

let cachedConfig = loadConfig();

function parsePort(value, fallback) {
    const port = Number.parseInt(value, 10);
    if (Number.isInteger(port) && port > 0) return port;
    return fallback;
}

function splitCsv(value) {
    if (Array.isArray(value)) return value;
    return String(value || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
}

function normalizeId(value) {
    return String(value || '').trim();
}

function normalizeConfig(input) {
    const source = input || {};
    const sourceDiscord = source.discord || {};
    const sourceChannels = sourceDiscord.channelIds || {};
    const sourceWeb = source.web || {};
    const sourceMC = source.minecraft || {};
    const sourceOutpost = source.outpost || {};

    return {
        web: {
            host: String(sourceWeb.host || DEFAULT_CONFIG.web.host).trim() || DEFAULT_CONFIG.web.host,
            port: parsePort(sourceWeb.port, DEFAULT_CONFIG.web.port)
        },
        discord: {
            token: String(sourceDiscord.token || '').trim(),
            selectedGuildId: normalizeId(sourceDiscord.selectedGuildId),
            adminUserIds: splitCsv(sourceDiscord.adminUserIds),
            adminRoleIds: splitCsv(sourceDiscord.adminRoleIds),
            channelIds: {
                chat: normalizeId(sourceChannels.chat || DEFAULT_CONFIG.discord.channelIds.chat),
                wall: normalizeId(sourceChannels.wall || DEFAULT_CONFIG.discord.channelIds.wall),
                weewoo: normalizeId(sourceChannels.weewoo || DEFAULT_CONFIG.discord.channelIds.weewoo),
                raid: normalizeId(sourceChannels.raid || DEFAULT_CONFIG.discord.channelIds.raid),
                ftop: normalizeId(sourceChannels.ftop || DEFAULT_CONFIG.discord.channelIds.ftop),
                tax: normalizeId(sourceChannels.tax || DEFAULT_CONFIG.discord.channelIds.tax),
                logs: normalizeId(sourceChannels.logs || DEFAULT_CONFIG.discord.channelIds.logs),
                raidBag: normalizeId(sourceChannels.raidBag || DEFAULT_CONFIG.discord.channelIds.raidBag)
            }
        },
        minecraft: {
            reminderMessage: String(sourceMC.reminderMessage || DEFAULT_CONFIG.minecraft.reminderMessage).trim(),
            serverCommand: String(sourceMC.serverCommand || DEFAULT_CONFIG.minecraft.serverCommand).trim()
        },
        outpost: {
            targetFaction: String(sourceOutpost.targetFaction || DEFAULT_CONFIG.outpost.targetFaction).trim(),
            isHolding: Boolean(sourceOutpost.isHolding ?? DEFAULT_CONFIG.outpost.isHolding)
        }
    };
}

function loadConfig() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        return normalizeConfig(JSON.parse(raw));
    } catch (error) {
        const defaults = normalizeConfig(DEFAULT_CONFIG);
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2));
        return defaults;
    }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cachedConfig, null, 2));
}

function getConfig() {
    return JSON.parse(JSON.stringify(cachedConfig));
}

function updateConfig(nextValues) {
    const current = getConfig();
    const merged = {
        web: {
            ...current.web,
            ...(nextValues.web || {})
        },
        discord: {
            ...current.discord,
            ...(nextValues.discord || {}),
            channelIds: {
                ...current.discord.channelIds,
                ...((nextValues.discord && nextValues.discord.channelIds) || {})
            }
        },
        minecraft: {
            ...current.minecraft,
            ...(nextValues.minecraft || {})
        },
        outpost: {
            ...current.outpost,
            ...(nextValues.outpost || {})
        }
    };

    cachedConfig = normalizeConfig(merged);
    saveConfig();
    return getConfig();
}

function maskToken(token) {
    if (!token) return '';
    if (token.length <= 8) return '*'.repeat(token.length);
    return `${token.slice(0, 4)}${'*'.repeat(token.length - 8)}${token.slice(-4)}`;
}

function getPublicConfig() {
    const config = getConfig();
    return {
        web: config.web,
        discord: {
            hasToken: Boolean(config.discord.token),
            maskedToken: maskToken(config.discord.token),
            selectedGuildId: config.discord.selectedGuildId,
            adminUserIds: config.discord.adminUserIds,
            adminRoleIds: config.discord.adminRoleIds,
            channelIds: config.discord.channelIds
        },
        minecraft: config.minecraft,
        outpost: config.outpost
    };
}

module.exports = {
    CONFIG_PATH,
    getConfig,
    getPublicConfig,
    updateConfig
};