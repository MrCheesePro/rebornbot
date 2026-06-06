const fs = require('fs');
const path = require('path');
let links = {};
const LINKS_PATH = path.join(__dirname, '../database/links.json');

// Load existing links from file at startup
try {
    const data = fs.readFileSync(LINKS_PATH);
    links = JSON.parse(data);
} catch (err) {
    console.log('No existing links.json, starting fresh.');
}

// Generate a 6-character code for Discord linking
function generateCode(discordId) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    links[code] = { discordId, checks: 0, raidChecks: 0 };
    save();
    return code;
}

// Link a Minecraft username to a code
function linkMC(mcName, code) {
    code = code.toUpperCase();
    if (!links[code]) return null;

    links[code].mc = mcName; // store MC username
    if (!links[code].checks) links[code].checks = 0;
    if (!links[code].raidChecks) links[code].raidChecks = 0;
    save();

    return links[code].discordId;
}

// Check if a Minecraft username is linked
function isLinked(mcName) {
    return Object.values(links).some(link => link.mc === mcName);
}

// Get MC name from Discord ID
function getLinkedMC(discordId) {
    const entry = Object.values(links).find(l => l.discordId === discordId);
    return entry ? entry.mc : null;
}

function incrementChecks(mcName, type = 'checks') {
    const entry = Object.values(links).find(l => l.mc === mcName);
    if (!entry) return null;
  
    if (!entry[type]) entry[type] = 0;
    entry[type]++;

    if (type === 'raidChecks') {
        if (!entry.sessionRaidChecks) entry.sessionRaidChecks = 0;
        entry.sessionRaidChecks++;
    }

    save();
    return entry[type];
}

function getRaidChecks(mcName) {
    const entry = Object.values(links).find(l => l.mc === mcName);
    return entry?.raidChecks || 0;
}

function getSessionRaidChecks(mcName) {
    const entry = Object.values(links).find(l => l.mc === mcName);
    return entry?.sessionRaidChecks || 0;
}

function getTopSessionRaidCheckers(limit) {
    const players = Object.values(links)
        .filter(link => link.mc && link.sessionRaidChecks && link.sessionRaidChecks > 0)
        .map(link => ({
            mcName: link.mc,
            discordId: link.discordId || 'Not Linked',
            checks: link.sessionRaidChecks || 0
        }))
        .sort((a, b) => b.checks - a.checks);
    
    return players.slice(0, limit);
}

function getAllLinks() {
    return links;
}

function unlinkByMC(mcName) {
    for (const key in links) {
        if (links[key].mc === mcName) {
            delete links[key];
            save();
            return true;
        }
    }
    return false;
}

function getChecks(mcName) {
    const entry = Object.values(links).find(l => l.mc === mcName);
    return entry?.checks || 0;
}

// Get leaderboard sorted by checks
function getLeaderboard() {
    // Filter to only include linked players with checks
    const players = Object.values(links)
        .filter(link => link.mc && (link.checks || link.checks === 0))
        .map(link => ({
            mcName: link.mc,
            discordId: link.discordId || 'Not Linked',
            checks: link.checks || 0
        }))
        .sort((a, b) => b.checks - a.checks); // Sort descending by checks
    
    return players;
}

// Unlink Discord account
function unlinkDiscord(discordId) {
    for (const key in links) {
        if (links[key].discordId === discordId) {
            delete links[key];
            save();
            return true;
        }
    }
    return false;
}

// Change linked Minecraft IGN
function changeIGN(discordId, newIGN) {
    newIGN = newIGN.toLowerCase();

    // Check if IGN already in use by someone else
    const alreadyUsed = Object.values(links).some(link =>
        link.mc &&
        link.mc.toLowerCase() === newIGN &&
        link.discordId !== discordId
    );

    if (alreadyUsed) return false;

    for (const key in links) {
        if (links[key].discordId === discordId) {
            links[key].mc = newIGN;
            save();
            return true;
        }
    }

    return false;
}

function resetAllChecks() {
    const backupName = `links_backup_${Date.now()}.json`;
    const backupPath = path.join(__dirname, '../database/', backupName);
    
    const dbDir = path.dirname(backupPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    // Save current state to a backup file
    fs.writeFileSync(backupPath, JSON.stringify(links, null, 2));

    // Reset all checks to 0
    for (const key in links) {
        if (links[key].checks !== undefined) {
            links[key].checks = 0;
        }
    }
    
    save(); // Save the reset state to links.json
    return backupName;
}

function resetRaidChecks() {
    const backupName = `links_raid_backup_${Date.now()}.json`;
    const backupPath = path.join(__dirname, '../database/', backupName);
    
    const dbDir = path.dirname(backupPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    // Save current state to a backup file
    fs.writeFileSync(backupPath, JSON.stringify(links, null, 2));

    // Reset only sessionRaidChecks to 0
    for (const key in links) {
        if (links[key].sessionRaidChecks !== undefined) {
            links[key].sessionRaidChecks = 0;
        }
    }
    
    save(); // Save the reset state to links.json
    return backupName;
}

function resetTotalRaidChecks() {
    const backupName = `links_total_raid_backup_${Date.now()}.json`;
    const backupPath = path.join(__dirname, '../database/', backupName);
    
    const dbDir = path.dirname(backupPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    // Save current state to a backup file
    fs.writeFileSync(backupPath, JSON.stringify(links, null, 2));

    // Reset the lifetime raidChecks to 0
    for (const key in links) {
        if (links[key].raidChecks !== undefined) {
            links[key].raidChecks = 0;
        }
    }
    
    save();
    return backupName;
}

// Save links to disk
function save() {
    const dbDir = path.dirname(LINKS_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(LINKS_PATH, JSON.stringify(links, null, 2));
}

module.exports = { generateCode, linkMC, isLinked, getLinkedMC, incrementChecks, getChecks, getRaidChecks, getSessionRaidChecks, getTopSessionRaidCheckers, getAllLinks, unlinkByMC, getLeaderboard, unlinkDiscord, changeIGN, resetAllChecks, resetRaidChecks, resetTotalRaidChecks };
