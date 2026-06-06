const mineflayer = require('mineflayer');
const EventEmitter = require('events');
const { addLog } = require('../functions/runtime');

let bot;
let reconnectTimeout = null;
const reconnectDelay = 10000;
const botEvents = new EventEmitter();

function createBot() {
  console.log("Creating Minecraft bot...");

  if (bot) {
    try {
      bot.removeAllListeners();
      bot.quit();
    } catch (error) {
      addLog('mc_event', 'Previous Minecraft bot cleanup hit an error.', error.message);
    }
  }

  bot = mineflayer.createBot({
    host: 'cosmicreborn.guard.cosmicdns.com',
    port: 25565,
    version: '1.8.9',
    username: process.env.MC_EMAIL1 || 'mrcheeseisawesome@gmail.com',
    auth: 'microsoft',
    physicsEnabled: false,
    keepAlive: true,
    checkTimeoutInterval: 60000
  });

  addLog('mc_event', 'Creating Minecraft bot...');

  // Notify index.js that a new bot instance is ready
  bot.once('login', () => {
    addLog('mc_event', 'Minecraft login succeeded.');
    botEvents.emit('newBot', bot);
  });

  const chatCooldowns = new Map();
  const MC_COOLDOWN_MS = 800;

  bot.on('chat', (username, message) => {
    const now = Date.now();
    const last = chatCooldowns.get(username) || 0;
    if (now - last < MC_COOLDOWN_MS) return;
    chatCooldowns.set(username, now);
    bot.emit('rateLimitedChat', username, message);
  });

  bot.on('message', jsonMsg => {
    const text = jsonMsg.toString().trim();
    if (!text) return;
    addLog('raw_chat', `RAW CHAT: ${text}`);
  });

  bot.once('spawn', () => {
    console.log("Logged in safely.");
    addLog('mc_event', 'Minecraft bot spawned successfully.');
    humanChat("Wall check bot online.");
  });

  bot.on('end', (reason) => {
    console.log(`MC bot disconnected: ${reason}. Retrying...`);
    addLog('mc_event', `Minecraft bot disconnected: ${reason}`);
    scheduleReconnect();
  });

  bot.on('error', (err) => {
    console.error("MC ERROR:", err);
    addLog('mc_error', `Minecraft error: ${err.message}`, err.code || null);

    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
      scheduleReconnect();
    }
  });

  bot.on('chunkColumnLoad', () => {});
  if (bot._client) {
    bot._client.on('map_chunk', () => {});
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) return;

  console.log(`Reconnecting in ${reconnectDelay / 1000} seconds...`);
  addLog('mc_event', `Reconnecting in ${reconnectDelay / 1000} seconds...`);

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    createBot();
  }, reconnectDelay);
}

function humanChat(msg) {
  if (bot && bot.player) {
    bot.chat(msg);
    addLog('mc_event', `Sent Minecraft chat: ${msg}`);
  }
}

process.on('uncaughtException', err => {
  console.error("MC BOT CRASH PREVENTED:", err);
  addLog('mc_error', `Uncaught exception: ${err.message}`);
});

process.on('unhandledRejection', err => {
  const message = err && err.message ? err.message : String(err);
  console.error("PROMISE ERROR:", err);
  addLog('mc_error', `Unhandled rejection: ${message}`);
});

createBot();

module.exports = {
  get bot() {
    return bot;
  },
  humanChat,
  botEvents
};
