const fs = require('fs');
const path = require('path');

const HISTORY_PATH = path.join(__dirname, '../database/ftop_history.json');

let history = [];

// Load existing history
try {
    if (fs.existsSync(HISTORY_PATH)) {
        const data = fs.readFileSync(HISTORY_PATH);
        history = JSON.parse(data);
    }
} catch (err) {
    console.log('No existing ftop_history.json or invalid JSON, starting fresh.');
    history = [];
}

function saveHistory() {
    const dbDir = path.dirname(HISTORY_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

function recordFTop(ftopData) {
    // Only record top 5
    const top5 = ftopData.slice(0, 5);
    const factions = {};

    top5.forEach(f => {
        // Convert '1,500,000' to 1500000
        const points = parseInt(f.total.replace(/,/g, ""), 10);
        factions[f.name] = points;
    });

    history.push({
        timestamp: Date.now(),
        factions
    });

    // Keep last 168 data points (7 days if hourly)
    if (history.length > 168) {
        history.splice(0, history.length - 168);
    }

    saveHistory();
}

function getGraphUrl() {
    if (history.length === 0) return null;

    // Get current top 5 faction names to track across history
    const latest = history[history.length - 1];
    const currentTop5Names = Object.keys(latest.factions);

    // To make 6-hour gaps, let's filter history to only include points that are approx 6 hours apart
    // Since it runs hourly, we can just take every 6th item from the end, going backwards
    const filteredHistory = [];
    for (let i = history.length - 1; i >= 0; i -= 6) {
        filteredHistory.unshift(history[i]);
    }

    const labels = filteredHistory.map(entry => {
        const d = new Date(entry.timestamp);
        // Format: "Mon 6PM"
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        let hour = d.getHours();
        const ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12;
        hour = hour ? hour : 12; // the hour '0' should be '12'
        return `${days[d.getDay()]} ${hour}${ampm}`;
    });

    const colors = [
        'rgb(255, 99, 132)', // Red
        'rgb(54, 162, 235)', // Blue
        'rgb(255, 206, 86)', // Yellow
        'rgb(75, 192, 192)', // Green
        'rgb(153, 102, 255)' // Purple
    ];

    const datasets = currentTop5Names.map((factionName, index) => {
        const data = filteredHistory.map(entry => entry.factions[factionName] || null); // null if they weren't in top 5
        return {
            label: factionName,
            data,
            borderColor: colors[index % colors.length],
            fill: false,
            tension: 0.1
        };
    });

    const chartConfig = {
        type: 'line',
        data: { labels, datasets },
        options: {
            title: { display: true, text: 'Top 5 Factions (Points over time)' },
            scales: {
                yAxes: [{
                    ticks: {
                        beginAtZero: true,
                        callback: function(value) {
                            if(value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                            if(value >= 1000) return (value / 1000).toFixed(1) + 'K';
                            return value;
                        }
                    }
                }]
            }
        }
    };

    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${encodedConfig}&w=800&h=400&bkg=white`;
}

module.exports = { recordFTop, getGraphUrl };
