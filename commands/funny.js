const { bot, humanChat } = require('../events/mc');

// Array of funny L variations
const L_VARIATIONS = [
    "L",
    "you're lowk trash",
    "lock in",
    "brotha please get better",
    "noob hat",
    "Lmans",
    "L rizz",
    "????",
    "please get better",
    "LLLL"
];

/**
 * Handles the "L spam" command with random delays.
 * @param {string} author - The username of the player sending the command
 * @param {string[]} args - Command arguments, [username, times]
 */
function handleLCommand(author, args) {
    if (args.length < 2) {
        humanChat(`/r ${author}, you need to provide a number from 1-10!`);
        return;
    }

    const target = args[0];
    const times = parseInt(args[1]);

    if (isNaN(times) || times < 1 || times > 10) {
        humanChat(`/r ${author}, the number must be between 1 and 10!`);
        return;
    }

    let i = 0;

    function sendNext() {
        if (i >= times) return;

        const randomL = L_VARIATIONS[Math.floor(Math.random() * L_VARIATIONS.length)];
        humanChat(`${randomL} ${target}`);

        i++;

        // Random delay between 5 and 15 seconds
        const delay = Math.floor(Math.random() * (15000 - 5000 + 1)) + 5000;
        setTimeout(sendNext, delay);
    }

    sendNext();
}

module.exports = { handleLCommand };
