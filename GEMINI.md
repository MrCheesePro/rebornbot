# RebornBot Project Guidelines

## Overview
RebornBot is a multi-purpose bot designed for the CosmicReborn Minecraft server. It integrates Minecraft automation, Discord communication, and a web-based administration dashboard for seamless faction management.

### Tech Stack
- **Runtime:** Node.js
- **Minecraft:** `mineflayer` (v1.8.9)
- **Discord:** `discord.js` (v14)
- **Dashboard:** Vanilla Node.js `http` server (Express-like structure)
- **Data:** JSON-based persistence (`links.json`, `bot-config.json`)

## Core Mechanics & Stability

### Minecraft Connection (`mc.js`, `index.js`)
- **Protocol:** Connects to `cosmicreborn.guard.cosmicdns.com`.
- **Proxy Stability:** Upon login, the bot waits **20 seconds** before attempting to join the sub-server. This allows the proxy connection to stabilize and prevents "socketClosed" errors.
- **Watchdog Mechanism:** A background process runs every **60 seconds** to ensure the bot is on the correct sub-server (default: `/server forgottenplanet`).
- **State Tracking:** Detects "Sending you to..." and "transferred" messages to handle server transitions gracefully.

### Discord Integration (`discord.js`)
- **Dynamic Configuration:** Supports hot-reloading Discord tokens and channel IDs via the Web Dashboard without restarts.
- **Admin Access:** Permission-based system using Discord IDs, Role IDs, or Administrator permissions.
- **Channel Mapping:** Dedicated channels for Chat, Walls, Weewoo (Alerts), Raids (Active pings), F Top, and Tax.

## Key Functionalities

### 1. Web Dashboard (`dashboard.js`)
The dashboard provides a central control point for bot operators:
- **MC Status & Chat:** Monitor connection status and send messages directly to the Minecraft server.
- **Automation Toggles:** Start/Stop the F Top Tracker and Wall Check Timer.
- **Account Management:** View all linked players and unlink accounts if necessary.
- **Hot Configuration:** Update Discord tokens, Server selection, and Channel mappings on the fly.
- **Outpost Settings:** Set the `targetFaction` for automatic outpost automation.
- **Raw Logs:** Real-time view of Minecraft raw chat.

### 2. Wall & Raid Checking (`wallcheck.js`)
- **Mechanic:** 
  - **Wall Check:** Triggered by `walls` or `check` in MC chat.
  - **Raid Check:** Triggered by `raid` in MC chat.
- **Timers:** 
  - A **1-minute** interval reminds players in Minecraft to check walls.
  - If walls remain unchecked for **15 minutes**, the bot pings the `@Wall Check` role on Discord.
- **Logging:** Every check is logged to the `#logs` channel with an embed showing duration since the last check, player totals, and a timestamp.
- **Cooldown:** A **60-second** cooldown per player prevents spamming checks.

### 3. Account Linking (`link.js`)
- **Purpose:** Maps Minecraft IGNs to Discord IDs for tracking and permissions.
- **Mechanic:**
  - User runs `!link` on Discord to receive a private 6-character code via DM.
  - User runs `/msg <bot> link <code>` in Minecraft.
  - The bot validates the code and stores the mapping in `links.json`.
- **Session Stats:** Tracks lifetime `checks` and `raidChecks`, plus `sessionRaidChecks`.

### 4. Tax Collection (`tax.js`)
- **Trigger:** Parses Minecraft chat for "payment received" messages: `$1,000,000 has been received from player`.
- **Mechanic:** Automatically attributes payments to linked players and updates a live Discord embed with a progress bar and payment statuses.

### 5. Raid Alerts - Weewoo (`weewoo.js`)
- **Trigger:** Linked players say `weewoo` in MC chat or run `!weewoo` on Discord.
- **Action:** Broadcasts a siren in MC and sends a Discord alert with buttons.
- **Active Raid:** Clicking "✅ Real Raid" starts a **5-second** recurring ping in the raid channel until manually stopped.

### 6. F Top Tracking (`discord.js`)
- **Mechanic:** Runs `/f top` in Minecraft, parses the results (Rank, Faction, Total Points, Weekly Points), and posts a formatted table to Discord.
- **Frequency:** Automatically runs every **60 minutes** once started.

### 7. Raid Outpost Automation (`raidoutpost.js`)
- **Mechanic:** Listens for server messages about the `targetFaction` claiming or losing the Raid Outpost territory.
- **Logic:** Automatically starts the wall check timer when the faction holds the territory and an outpost event begins.

## Command Reference

### Discord Commands
- `!help`: Lists all available commands.
- `!link`: Generates a code to link MC account.
- `!unlink`: Unlinks the user's account.
- `!changelink <IGN>`: Updates the linked Minecraft IGN.
- `!leaderboard` / `!lb`: Displays the wall check leaderboard.
- `!stats [IGN]`: Shows check statistics for yourself or another player.
- `!weewoo`: Manually triggers a raid alert.
- `!start` / `!stop`: Manually manages the wall check timer.
- `!ftop` / `!ftopstop`: Controls the hourly F Top tracker.
- `!tax goal <amount> <hours>`: Starts a new tax collection period.
- `!raidbag`: Posts a question to reset session raid checks.
- `!say <message>`: Sends a message to Minecraft chat as the bot.
- `!linklist`: (Admin) Displays a table of all linked players and their Discord IDs.
- `!resetchecks`: (Admin) Resets all wall check counts (creates a backup file).

### Minecraft Commands (In-Chat)
- `link <code>`: Links the player's account to Discord.
- `walls` / `check`: Records a wall check.
- `raid`: Records a raid check.
- `weewoo`: Triggers a raid alert.
- `L <player> [1-10]`: Spams "L" variations at a player (random delays).

## Data Persistence
- `bot-config.json`: Stores all configuration (Discord token, channels, outpost settings).
- `links.json`: Stores all player mappings, check counts, and session data.
- `.env`: Used for initial environment variables (Port, Host).
