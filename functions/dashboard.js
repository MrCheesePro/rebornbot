const http = require('http');
const { URL } = require('url');
const { getConfig, getPublicConfig, updateConfig } = require('./config');
const { getLogs } = require('./runtime');
const {
    getDiscordStatus,
    listDiscordGuilds,
    listDiscordChannels,
    reloadDiscordFromConfig,
    startFtop,
    stopFtop,
    isFtopRunning,
    startWallTimer,
    stopWallTimer,
    isWallTimerRunning
} = require('../events/discord');

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';

        req.on('data', chunk => {
            raw += chunk;
            if (raw.length > 1_000_000) {
                reject(new Error('Request body too large.'));
                req.destroy();
            }
        });

        req.on('end', () => {
            if (!raw) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(new Error('Invalid JSON payload.'));
            }
        });

        req.on('error', reject);
    });
}

function sendJson(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function sendHtml(res, html) {
    res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(html);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function safeJsonForScript(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

function renderDashboardPage() {
    const config = getPublicConfig();
    const discordStatus = getDiscordStatus();
    const logs = getLogs(120);

    const initialData = safeJsonForScript({
        config,
        discordStatus,
        logs,
        ftopRunning: isFtopRunning(),
        wallTimerRunning: isWallTimerRunning()
    });

    const statusState = discordStatus.state || 'idle';
    const statusText = [
        statusState,
        discordStatus.userTag,
        discordStatus.message
    ].filter(Boolean).join(' • ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>RebornBot Control Panel</title>
    <style>
        :root {
            --bg: #0f172a;
            --panel: rgba(15, 23, 42, 0.78);
            --panel-strong: rgba(30, 41, 59, 0.92);
            --line: rgba(148, 163, 184, 0.25);
            --text: #e2e8f0;
            --muted: #94a3b8;
            --accent: #38bdf8;
            --accent-strong: #0ea5e9;
            --good: #22c55e;
            --bad: #f97316;
            --shadow: 0 30px 60px rgba(2, 6, 23, 0.45);
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            min-height: 100vh;
            font-family: "Segoe UI", Helvetica, Arial, sans-serif;
            color: var(--text);
            background:
                radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 28%),
                radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.16), transparent 30%),
                linear-gradient(135deg, #020617 0%, #0f172a 48%, #111827 100%);
        }

        .wrap {
            width: min(1120px, calc(100% - 32px));
            margin: 32px auto;
            display: grid;
            gap: 20px;
        }

        .hero, .panel {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 24px;
            box-shadow: var(--shadow);
            backdrop-filter: blur(16px);
        }

        .hero {
            padding: 28px;
        }

        .hero h1 {
            margin: 0 0 8px;
            font-size: clamp(28px, 4vw, 44px);
            line-height: 1;
        }

        .hero p {
            margin: 0;
            color: var(--muted);
            max-width: 720px;
            line-height: 1.5;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 20px;
        }

        .panel {
            padding: 22px;
        }

        .panel h2 {
            margin: 0 0 16px;
            font-size: 18px;
        }

        .status {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 12px;
            font-weight: 600;
        }

        .dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--muted);
            box-shadow: 0 0 18px currentColor;
        }

        .dot.ready { color: var(--good); background: var(--good); }
        .dot.error { color: var(--bad); background: var(--bad); }
        .dot.connecting { color: var(--accent); background: var(--accent); }
        .dot.idle { color: var(--muted); background: var(--muted); }

        form {
            display: grid;
            gap: 14px;
        }

        label {
            display: grid;
            gap: 6px;
            font-size: 14px;
            color: var(--muted);
        }

        input, select, button {
            width: 100%;
            border-radius: 14px;
            border: 1px solid rgba(148, 163, 184, 0.22);
            background: var(--panel-strong);
            color: var(--text);
            font: inherit;
            padding: 12px 14px;
        }

        input::placeholder {
            color: #64748b;
        }

        button {
            cursor: pointer;
            background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
            border: none;
            font-weight: 700;
            transition: transform 0.1s;
        }

        button:active { transform: scale(0.98); }

        button.secondary {
            background: rgba(148, 163, 184, 0.16);
            border: 1px solid rgba(148, 163, 184, 0.16);
        }

        button.danger {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }

        .actions {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }

        .dot.warning { 
            color: #facc15; 
            background: #facc15; 
        }

        .hint, .small {
            color: var(--muted);
            font-size: 13px;
            line-height: 1.5;
        }

        .banner {
            min-height: 24px;
            font-size: 14px;
            font-weight: 600;
        }

        .banner.ok { color: #86efac; }
        .banner.error { color: #fdba74; }

        .meta {
            display: grid;
            gap: 8px;
            font-size: 14px;
            color: var(--muted);
        }

        #masked-token {
            display: inline-block;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            vertical-align: bottom;
        }

        .log-box {
            min-height: 340px;
            max-height: 60vh;
            overflow: auto;
            border-radius: 18px;
            border: 1px solid rgba(148, 163, 184, 0.14);
            background: rgba(2, 6, 23, 0.75);
            padding: 14px;
        }

        .log-entry {
            display: grid;
            gap: 4px;
            padding: 10px 0;
            border-bottom: 1px solid rgba(148, 163, 184, 0.08);
        }

        .log-entry:last-child {
            border-bottom: none;
        }

        .log-meta {
            color: #7dd3fc;
            font-size: 12px;
            letter-spacing: 0.02em;
            text-transform: uppercase;
        }

        .log-message {
            white-space: pre-wrap;
            word-break: break-word;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 13px;
        }

        code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            color: #bae6fd;
        }

        .control-group {
            display: grid;
            gap: 10px;
            padding: 14px;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(148, 163, 184, 0.1);
        }

        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            background: rgba(148, 163, 184, 0.2);
        }

        .badge.active { background: #22c55e; color: #fff; }
        .badge.inactive { background: #64748b; color: #fff; }

        .links-list {
            display: grid;
            gap: 8px;
            max-height: 300px;
            overflow-y: auto;
            border-radius: 14px;
            border: 1px solid rgba(148, 163, 184, 0.1);
            padding: 8px;
            background: rgba(255, 255, 255, 0.02);
        }

        .link-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--panel-strong);
            border-radius: 10px;
            font-size: 14px;
        }

        .link-item button {
            width: auto;
            padding: 4px 10px;
            font-size: 12px;
        }

        .link-info {
            display: grid;
        }

        .link-mc { font-weight: 600; color: var(--accent); }
        .link-discord { font-size: 12px; color: var(--muted); }

    </style>
</head>
<body>
    <div class="wrap">
        <section class="hero">
            <h1>RebornBot Control Panel</h1>
            <p>Configure the Discord bot token, choose the guild, map each Discord channel, and manage admin access without editing source files on the VPS.</p>
        </section>

        <div class="grid">
            <section class="panel">
                <h2>Minecraft Status & Chat</h2>
                <div class="status">
                    <span id="mc-status-dot" class="dot ready"></span>
                    <span id="mc-account-text">Checking status...</span>
                </div>
                <form id="game-chat-form">
                    <label>
                        Send Message to Minecraft
                        <input id="game-chat-input" name="message" placeholder="Type a message to send to in-game chat...">
                    </label>
                    <button type="submit">Send to Game</button>
                </form>
                <div class="meta" style="margin-top: 14px;">
                    <div>Logged in as: <code id="mc-username-display">Loading...</code></div>
                    <div>Server: <code>cosmicreborn.guard.cosmicdns.com</code></div>
                </div>
            </section>

            <section class="panel">
                <h2>Automation Controls</h2>
                <div class="control-group">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>F Top Tracker</span>
                        <span id="ftop-badge" class="badge">Checking...</span>
                    </div>
                    <div class="actions">
                        <button id="ftop-start-btn" class="secondary">Start</button>
                        <button id="ftop-stop-btn" class="danger">Stop</button>
                    </div>
                </div>
                <div class="control-group" style="margin-top: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>Wall Check Timer</span>
                        <span id="wall-badge" class="badge">Checking...</span>
                    </div>
                    <div class="actions">
                        <button id="wall-start-btn" class="secondary">Start</button>
                        <button id="wall-stop-btn" class="danger">Stop</button>
                    </div>
                </div>
            </section>

            <section class="panel">
                <h2>Linked Accounts</h2>
                <div class="actions" style="margin-bottom: 12px;">
                    <button type="button" class="secondary" id="refresh-links">Refresh List</button>
                </div>
                <div class="links-list" id="links-container">
                    <div class="link-item" style="justify-content: center; color: var(--muted);">Loading links...</div>
                </div>
            </section>

            <section class="panel">
                <h2>Discord Connection</h2>
                <div class="status">
                    <span id="status-dot" class="dot ${escapeHtml(statusState)}"></span>
                    <span id="status-text">${escapeHtml(statusText)}</span>
                </div>
                <div class="meta">
                    <div>Saved token: <code id="masked-token">${escapeHtml(config.discord.maskedToken || 'not set')}</code></div>
                    <div>Dashboard: <code>http://${escapeHtml(config.web.host)}:${escapeHtml(config.web.port)}</code></div>
                </div>
                <form id="config-form">
                    <label>
                        Discord Bot Token
                        <input id="discord-token" name="token" type="password" placeholder="Paste a bot token to connect or replace the current one">
                    </label>
                    <label>
                        Discord Server
                        <select id="guild-select" name="selectedGuildId">
                            <option value="">Select a connected server</option>
                        </select>
                    </label>
                    <div class="actions">
                        <button type="button" class="secondary" id="refresh-guilds">Refresh Servers</button>
                        <button type="submit">Save Settings</button>
                    </div>
                    <div id="banner" class="banner"></div>
                </form>
            </section>

            <section class="panel">
                <h2>Outpost Settings</h2>
                <form id="outpost-form">
                    <label>
                        Target Faction
                        <input id="outpost-faction" name="targetFaction" value="${escapeHtml(config.outpost.targetFaction)}" placeholder="TurtleGang">
                    </label>
                    <p class="hint">The bot will automatically manage wall check timers based on this faction's control of the Raid Outpost.</p>
                    <div class="actions">
                        <button type="submit">Update Outpost</button>
                    </div>
                </form>
            </section>

            <section class="panel">
                <h2>Channel Mapping</h2>
                <form id="channel-form">
                    <label>Chat Channel<select id="channel-chat"></select></label>
                    <label>Wall Channel<select id="channel-wall"></select></label>
                    <label>Weewoo Channel<select id="channel-weewoo"></select></label>
                    <label>Raid Channel<select id="channel-raid"></select></label>
                    <label>FTop Channel<select id="channel-ftop"></select></label>
                    <label>Tax Channel<select id="channel-tax"></select></label>
                </form>
            </section>

            <section class="panel" style="grid-column: 1 / -1;">
                <h2>Minecraft Raw Chat</h2>
                <div class="actions">
                    <button type="button" class="secondary" id="refresh-logs">Refresh Logs</button>
                </div>
                <div class="log-box" id="log-box"></div>
            </section>
        </div>
    </div>

    <script id="initial-data" type="application/json">${initialData}</script>
    <script>
        (function() {
            try {
                const dataEl = document.getElementById('initial-data');
                if (!dataEl) throw new Error('Critical: Initial data block missing.');
                
                const initialData = JSON.parse(dataEl.textContent);
                console.log('Dashboard initialized with data:', initialData);

                const state = {
                    config: initialData.config,
                    guilds: [],
                    channels: [],
                    logs: initialData.logs || [],
                    discordStatus: initialData.discordStatus || {},
                    ftopRunning: initialData.ftopRunning,
                    wallTimerRunning: initialData.wallTimerRunning
                };

                const ids = {
                    chat: document.getElementById('channel-chat'),
                    wall: document.getElementById('channel-wall'),
                    weewoo: document.getElementById('channel-weewoo'),
                    raid: document.getElementById('channel-raid'),
                    ftop: document.getElementById('channel-ftop'),
                    tax: document.getElementById('channel-tax')
                };

                function setBanner(text, type) {
                    const banner = document.getElementById('banner');
                    if (banner) {
                        banner.textContent = text || '';
                        banner.className = 'banner' + (type ? ' ' + type : '');
                    }
                }

                function fillSelect(select, items, selectedValue) {
                    if (!select) return;
                    const options = ['<option value="">Select channel</option>'];
                    for (const item of items) {
                        const selected = item.id === selectedValue ? ' selected' : '';
                        options.push('<option value="' + item.id + '"' + selected + '>' + item.name + '</option>');
                    }
                    select.innerHTML = options.join('');
                }

                function renderStatus(status) {
                    const dot = document.getElementById('status-dot');
                    const text = document.getElementById('status-text');
                    if (dot) dot.className = 'dot ' + (status.state || 'idle');
                    if (text) {
                        const pieces = [status.state || 'idle'];
                        if (status.userTag) pieces.push(status.userTag);
                        if (status.message) pieces.push(status.message);
                        text.textContent = pieces.join(' • ');
                    }
                }

                function updateBadges() {
                    const ftopBadge = document.getElementById('ftop-badge');
                    const wallBadge = document.getElementById('wall-badge');
                    
                    if (ftopBadge) {
                        ftopBadge.textContent = state.ftopRunning ? 'Active' : 'Inactive';
                        ftopBadge.className = 'badge ' + (state.ftopRunning ? 'active' : 'inactive');
                    }
                    if (wallBadge) {
                        wallBadge.textContent = state.wallTimerRunning ? 'Active' : 'Inactive';
                        wallBadge.className = 'badge ' + (state.wallTimerRunning ? 'active' : 'inactive');
                    }
                }

                function applyConfigToForm(config) {
                    const elToken = document.getElementById('masked-token');
                    const elUsers = document.getElementById('admin-users');
                    const elRoles = document.getElementById('admin-roles');
                    const elOutpost = document.getElementById('outpost-faction');

                    if (elToken) elToken.textContent = config.discord.maskedToken || 'not set';
                    if (elUsers) elUsers.value = (config.discord.adminUserIds || []).join(', ');
                    if (elRoles) elRoles.value = (config.discord.adminRoleIds || []).join(', ');
                    if (elOutpost) elOutpost.value = config.outpost.targetFaction || '';
                }

                function escapeHtmlClient(value) {
                    return String(value)
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;');
                }

                function renderLogs(entries) {
                    const box = document.getElementById('log-box');
                    if (!box) return;
                    const rawChatEntries = entries.filter(entry => entry.type === 'raw_chat' || entry.type === 'mc_raw');

                    if (!rawChatEntries.length) {
                        box.innerHTML = '<div class="log-entry"><div class="log-message">No RAW CHAT lines yet.</div></div>';
                        return;
                    }

                    box.innerHTML = rawChatEntries.map(entry => {
                        const ts = new Date(entry.ts).toLocaleString();
                        const meta = ts + ' • raw chat';
                        const details = entry.details ? '\\n' + String(entry.details) : '';
                        const message = String(entry.message || '') + details;
                        return '<div class="log-entry"><div class="log-meta">' + escapeHtmlClient(meta) + '</div><div class="log-message">' + escapeHtmlClient(message) + '</div></div>';
                    }).join('');
                    box.scrollTop = box.scrollHeight;
                }

                async function refreshLinks() {
                    try {
                        const response = await fetch('/api/links');
                        const data = await response.json();
                        const container = document.getElementById('links-container');
                        
                        if (!response.ok) throw new Error(data.error);
                        
                        if (data.links.length === 0) {
                            container.innerHTML = '<div class="link-item" style="justify-content: center; color: var(--muted);">No linked accounts found.</div>';
                            return;
                        }

                        // Use map and join to securely build the HTML without exposing XSS via discordId/mc
                        container.innerHTML = data.links.map(link => {
                            const escMc = escapeHtmlClient(link.mc);
                            const escId = escapeHtmlClient(link.discordId);
                            return \`<div class="link-item">
                                <div class="link-info">
                                    <span class="link-mc">\${escMc}</span>
                                    <span class="link-discord">Discord ID: \${escId}</span>
                                </div>
                                <button type="button" class="danger" onclick="deleteLink('\${escId}')">Unlink</button>
                            </div>\`;
                        }).join('');

                    } catch (e) {
                        console.error('Failed to load links:', e);
                    }
                }

                window.deleteLink = async function(discordId) {
                    if (!confirm('Are you sure you want to unlink this account?')) return;
                    
                    try {
                        const response = await fetch('/api/links/' + encodeURIComponent(discordId), {
                            method: 'DELETE'
                        });
                        const data = await response.json();
                        if (!response.ok) throw new Error(data.error);
                        
                        setBanner('Account unlinked successfully.', 'ok');
                        refreshLinks(); // reload the list
                    } catch (e) {
                        setBanner('Failed to unlink: ' + e.message, 'error');
                    }
                };

                async function refreshStatus() {
                    try {
                        const response = await fetch('/api/status');
                        const payload = await response.json();

                        if (!response.ok) throw new Error(payload.error || 'Could not load status.');

                        state.config = payload.config;
                        state.discordStatus = payload.discordStatus;
                        state.ftopRunning = payload.ftopRunning;
                        state.wallTimerRunning = payload.wallTimerRunning;

                        renderStatus(payload.discordStatus);
                        applyConfigToForm(payload.config);
                        updateBadges();

                        if (payload.minecraft) {
                            const mcText = document.getElementById('mc-account-text');
                            const mcDot = document.getElementById('mc-status-dot');
                            const mcUser = document.getElementById('mc-username-display');

                            if (mcText) mcText.textContent = payload.minecraft.status;
                            if (mcUser) mcUser.textContent = payload.minecraft.username;
                            if (mcDot) {
                                if (payload.minecraft.status === 'Online') {
                                    mcDot.className = 'dot ready';
                                } else if (payload.minecraft.status.includes('Retrying')) {
                                    mcDot.className = 'dot warning';
                                } else {
                                    mcDot.className = 'dot error';
                                }
                            }
                        }
                        return payload;
                    } catch (e) {
                        console.error('Status refresh failed:', e);
                    }
                }

                async function refreshLogs() {
                    try {
                        const response = await fetch('/api/logs?limit=180');
                        const payload = await response.json();
                        if (!response.ok) throw new Error(payload.error || 'Could not load logs.');
                        state.logs = payload.logs || [];
                        renderLogs(state.logs);
                    } catch (e) {
                        console.error('Log refresh failed:', e);
                    }
                }

                async function loadGuilds() {
                    setBanner('Loading Discord servers...', '');
                    try {
                        const response = await fetch('/api/guilds');
                        const payload = await response.json();

                        if (!response.ok) {
                            setBanner(payload.error || 'Could not load servers.', 'error');
                            return;
                        }

                        state.guilds = payload.guilds;
                        const select = document.getElementById('guild-select');
                        if (!select) return;
                        const options = ['<option value="">Select a connected server</option>'];

                        for (const guild of state.guilds) {
                            const selected = guild.id === state.config.discord.selectedGuildId ? ' selected' : '';
                            options.push('<option value="' + guild.id + '"' + selected + '>' + guild.name + '</option>');
                        }

                        select.innerHTML = options.join('');
                        select.value = state.config.discord.selectedGuildId || '';

                        setBanner(
                            state.guilds.length ? 'Discord servers loaded.' : 'No guilds found for this bot token.',
                            state.guilds.length ? 'ok' : 'error'
                        );

                        if (select.value) {
                            await loadChannels(select.value);
                        } else {
                            Object.values(ids).forEach(selectNode => fillSelect(selectNode, [], ''));
                        }
                    } catch (e) {
                        setBanner('Error loading guilds.', 'error');
                    }
                }

                async function loadChannels(guildId) {
                    if (!guildId) {
                        Object.values(ids).forEach(select => fillSelect(select, [], ''));
                        return;
                    }

                    try {
                        const response = await fetch('/api/channels?guildId=' + encodeURIComponent(guildId));
                        const payload = await response.json();

                        if (!response.ok) {
                            setBanner(payload.error || 'Could not load channels.', 'error');
                            return;
                        }

                        state.channels = payload.channels;
                        const selected = state.config.discord.channelIds;
                        fillSelect(ids.chat, state.channels, selected.chat);
                        fillSelect(ids.wall, state.channels, selected.wall);
                        fillSelect(ids.weewoo, state.channels, selected.weewoo);
                        fillSelect(ids.raid, state.channels, selected.raid);
                        fillSelect(ids.ftop, state.channels, selected.ftop);
                        fillSelect(ids.tax, state.channels, selected.tax);
                    } catch (e) {
                        setBanner('Error loading channels.', 'error');
                    }
                }

                async function saveConfig(event) {
                    if (event) event.preventDefault();

                    const tokenField = document.getElementById('discord-token');
                    const payload = {
                        discord: {
                            selectedGuildId: document.getElementById('guild-select').value,
                            adminUserIds: document.getElementById('admin-users').value.split(',').map(s => s.trim()).filter(Boolean),
                            adminRoleIds: document.getElementById('admin-roles').value.split(',').map(s => s.trim()).filter(Boolean),
                            channelIds: {
                                chat: ids.chat.value,
                                wall: ids.wall.value,
                                weewoo: ids.weewoo.value,
                                raid: ids.raid.value,
                                ftop: ids.ftop.value,
                                tax: ids.tax.value
                            }
                        },
                        outpost: {
                            targetFaction: document.getElementById('outpost-faction').value
                        }
                    };

                    if (tokenField && tokenField.value.trim()) {
                        payload.discord.token = tokenField.value.trim();
                    }

                    try {
                        const response = await fetch('/api/config', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });

                        const result = await response.json();

                        if (!response.ok) {
                            setBanner(result.error || 'Could not save settings.', 'error');
                            return;
                        }

                        state.config = result.config;
                        state.discordStatus = result.discordStatus || state.discordStatus;

                        if (tokenField) tokenField.value = '';
                        renderStatus(state.discordStatus);
                        applyConfigToForm(state.config);
                        setBanner('Settings saved successfully.', 'ok');

                        await loadGuilds();
                        await refreshStatus();
                    } catch (e) {
                        setBanner('Error saving configuration.', 'error');
                    }
                }

                async function toggleAutomation(type, action) {
                    try {
                        const response = await fetch('/api/' + type + '/toggle', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action })
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error);
                        
                        if (type === 'ftop') state.ftopRunning = (action === 'start');
                        if (type === 'wallcheck') state.wallTimerRunning = (action === 'start');
                        
                        updateBadges();
                        setBanner(type.toUpperCase() + ' automation ' + action + 'ed.', 'ok');
                    } catch (e) {
                        setBanner('Failed to ' + action + ' ' + type + ': ' + e.message, 'error');
                    }
                }

                // Event Listeners
                document.getElementById('game-chat-form')?.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const input = document.getElementById('game-chat-input');
                    const message = input.value.trim();
                    if (!message) return;

                    try {
                        const response = await fetch('/api/game-chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message })
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.error);
                        input.value = '';
                        setBanner('Message sent to Minecraft.', 'ok');
                    } catch (err) {
                        setBanner('Failed to send message: ' + err.message, 'error');
                    }
                });

                document.getElementById('ftop-start-btn')?.addEventListener('click', () => toggleAutomation('ftop', 'start'));
                document.getElementById('ftop-stop-btn')?.addEventListener('click', () => toggleAutomation('ftop', 'stop'));
                document.getElementById('wall-start-btn')?.addEventListener('click', () => toggleAutomation('wallcheck', 'start'));
                document.getElementById('wall-stop-btn')?.addEventListener('click', () => toggleAutomation('wallcheck', 'stop'));

                const configForm = document.getElementById('config-form');
                if (configForm) configForm.addEventListener('submit', saveConfig);

                const outpostForm = document.getElementById('outpost-form');
                if (outpostForm) outpostForm.addEventListener('submit', saveConfig);
                
                const channelForm = document.getElementById('channel-form');
                if (channelForm) channelForm.addEventListener('change', saveConfig);

                const guildSelect = document.getElementById('guild-select');
                if (guildSelect) {
                    guildSelect.addEventListener('change', async event => {
                        state.config.discord.selectedGuildId = event.target.value;
                        await loadChannels(event.target.value);
                        setBanner('', '');
                    });
                }

                const refreshGuildsBtn = document.getElementById('refresh-guilds');
                if (refreshGuildsBtn) refreshGuildsBtn.addEventListener('click', loadGuilds);

                const refreshLogsBtn = document.getElementById('refresh-logs');
                if (refreshLogsBtn) refreshLogsBtn.addEventListener('click', refreshLogs);
                
                const refreshLinksBtn = document.getElementById('refresh-links');
                if (refreshLinksBtn) refreshLinksBtn.addEventListener('click', refreshLinks);

                // Initial load
                renderStatus(state.discordStatus);
                applyConfigToForm(state.config);
                renderLogs(state.logs);
                updateBadges();
                refreshLinks();
                
                refreshStatus().then(() => {
                    loadGuilds();
                    refreshLogs();
                });

                setInterval(() => {
                    refreshLogs().catch(() => {});
                }, 3000);

            } catch (error) {
                console.error('Dashboard error:', error);
                const banner = document.getElementById('banner');
                if (banner) banner.textContent = 'Dashboard failed to initialize: ' + error.message;
            }
        })();
    </script>
</body>
</html>`;
}

async function handleApi(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/api/status') {
        const mc = require('../events/mc');
        const isBotConnected = mc.bot && mc.bot._client && mc.bot._client.state === 'play';

        sendJson(res, 200, {
            config: getPublicConfig(),
            discordStatus: getDiscordStatus(),
            ftopRunning: isFtopRunning(),
            wallTimerRunning: isWallTimerRunning(),
            minecraft: {
                username: mc.bot ? mc.bot.username : 'Not Logged In',
                status: isBotConnected ? 'Online' : 'Disconnected / Retrying...',
                host: 'cosmicreborn.guard.cosmicdns.com'
            }
        });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/game-chat') {
        try {
            const body = await readJsonBody(req);
            const { message } = body;
            const mc = require('../events/mc');
            
            if (!mc.bot) throw new Error('Minecraft bot is not connected.');
            mc.humanChat(message);
            
            sendJson(res, 200, { ok: true });
        } catch (error) {
            sendJson(res, 400, { error: error.message });
        }
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/ftop/toggle') {
        try {
            const body = await readJsonBody(req);
            if (body.action === 'start') {
                startFtop();
            } else {
                stopFtop();
            }
            sendJson(res, 200, { ok: true });
        } catch (error) {
            sendJson(res, 400, { error: error.message });
        }
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/wallcheck/toggle') {
        try {
            const body = await readJsonBody(req);
            if (body.action === 'start') {
                startWallTimer();
            } else {
                stopWallTimer();
            }
            sendJson(res, 200, { ok: true });
        } catch (error) {
            sendJson(res, 400, { error: error.message });
        }
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/logs') {
        sendJson(res, 200, {
            logs: getLogs(url.searchParams.get('limit'))
        });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/guilds') {
        try {
            const guilds = await listDiscordGuilds();
            sendJson(res, 200, { guilds });
        } catch (error) {
            sendJson(res, 400, { error: error.message });
        }
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/channels') {
        const guildId = url.searchParams.get('guildId');
        try {
            const channels = await listDiscordChannels(guildId);
            sendJson(res, 200, { channels });
        } catch (error) {
            sendJson(res, 400, { error: error.message });
        }
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/links') {
        const { getAllLinks } = require('../commands/link');
        const linksData = getAllLinks();
        // Format them as an array of objects
        const links = Object.keys(linksData).map(code => ({
            code,
            discordId: linksData[code].discordId,
            mc: linksData[code].mc || 'Pending...'
        }));
        sendJson(res, 200, { links });
        return;
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/links/')) {
        const { unlinkDiscord } = require('../commands/link');
        const discordId = url.pathname.split('/').pop();
        if (unlinkDiscord(discordId)) {
            sendJson(res, 200, { ok: true });
        } else {
            sendJson(res, 404, { error: 'Link not found.' });
        }
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/config') {
        try {
            const body = await readJsonBody(req);
            updateConfig(body);
            await reloadDiscordFromConfig();
            sendJson(res, 200, {
                ok: true,
                config: getPublicConfig(),
                discordStatus: getDiscordStatus()
            });
        } catch (error) {
            sendJson(res, 400, { error: error.message });
        }
        return;
    }

    sendJson(res, 404, { error: 'Not found.' });
}

function startDashboard() {
    const config = getConfig();
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

        try {
            if (url.pathname.startsWith('/api/')) {
                await handleApi(req, res, url);
                return;
            }

            if (req.method === 'GET' && url.pathname === '/') {
                sendHtml(res, renderDashboardPage());
                return;
            }

            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found.');
        } catch (error) {
            console.error('Dashboard server error:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(error.message || 'Internal server error.');
        }
    });

    server.listen(config.web.port, config.web.host, () => {
        console.log(`Dashboard listening on http://${config.web.host}:${config.web.port}`);
    });

    return server;
}

module.exports = { startDashboard };
