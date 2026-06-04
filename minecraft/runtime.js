const MAX_LOGS = 300;

const logs = [];

function addLog(type, message, details = null) {
    const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: new Date().toISOString(),
        type: String(type || 'info'),
        message: String(message || ''),
        details: details || null
    };

    logs.push(entry);
    if (logs.length > MAX_LOGS) {
        logs.splice(0, logs.length - MAX_LOGS);
    }

    return entry;
}

function getLogs(limit = 150) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 150, MAX_LOGS));
    return logs.slice(-safeLimit);
}

module.exports = {
    addLog,
    getLogs
};
