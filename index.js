const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('baileys');
const Pino = require('pino');
const cron = require('node-cron');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

// Load prayer times from a JSON file
const prayerTimes = JSON.parse(fs.readFileSync('prayerTimes.json', 'utf-8'));

// --------------------- Messaging Function --------------------- //
async function sendMessage(sock, recipient, message) {
    await sock.sendMessage(recipient, { text: message });
}

// --------------------- Subscribers Management --------------------- //
const subscribersFile = 'subscribers.json';
function getSubscribers() {
    if (!fs.existsSync(subscribersFile)) return [];
    return JSON.parse(fs.readFileSync(subscribersFile, 'utf-8'));
}

function addSubscriber(number) {
    let subscribers = getSubscribers();
    if (!subscribers.includes(number)) {
        subscribers.push(number);
        fs.writeFileSync(subscribersFile, JSON.stringify(subscribers));
    }
}

function removeSubscriber(number) {
    let subscribers = getSubscribers().filter(sub => sub !== number);
    fs.writeFileSync(subscribersFile, JSON.stringify(subscribers));
}

// --------------------- WhatsApp Bot Function --------------------- //
async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: Pino({ level: 'silent' })
    });
    
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        console.log('Connection update:', connection); // Log connection updates
        if (connection === 'close') {
            console.log('Reconnecting...');
            startWhatsAppBot();
        } else if (connection === 'open') {
            console.log('Bot connected! ✅');
            // Start scheduling reminders only after the bot is connected
            schedulePrayerReminders(sock);
        } else if (connection === 'qr') {
            console.log('QR Code received, scan it:');
            qrcode.generate(lastDisconnect.qr, { small: true });
        }
    });
    
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        
        if (text?.toLowerCase() === 'subscribe') {
            addSubscriber(sender);
            await sendMessage(sock, sender, 'You have subscribed to prayer time reminders! ✅');
        } else if (text?.toLowerCase() === 'unsubscribe') {
            removeSubscriber(sender);
            await sendMessage(sock, sender, 'You have unsubscribed from prayer time reminders. ❌');
        }
    });
    
    return sock;
}

// --------------------- Prayer Reminder Scheduling --------------------- //
function schedulePrayerReminders(sock) {
    const now = new Date();
    const currentMonth = now.toLocaleString('default', { month: 'long' });
    const currentDay = now.getDate();

    if (!prayerTimes[currentMonth]) {
        console.error(`Prayer times for ${currentMonth} not found.`);
        return;
    }
    const monthTimes = prayerTimes[currentMonth];

    let dayRangeKey = null;
    for (const range in monthTimes) {
        const [start, end] = range.split('-').map(Number);
        if (currentDay >= start && currentDay <= end) {
            dayRangeKey = range;
            break;
        }
    }
    if (!dayRangeKey) {
        console.error(`Prayer times for day ${currentDay} not found in month ${currentMonth}.`);
        return;
    }
    
    const todaysPrayerTimes = monthTimes[dayRangeKey];

    Object.entries(todaysPrayerTimes).forEach(([prayer, timeValue]) => {
        const timeStr = String(timeValue);
        const parts = timeStr.split('.');
        let hour = parts[0];
        let minute = parts[1] || "00";

        if (minute.length === 1) minute = '0' + minute;

        const cronTime = `${minute} ${hour} * * *`;
        cron.schedule(cronTime, async () => {
            const message = `📢 Reminder: It's time for ${prayer} prayer!`;
            const subscribers = getSubscribers();
            for (const subscriber of subscribers) {
                await sendMessage(sock, subscriber, message);
            }
        });

        console.log(`Scheduled ${prayer} reminder at ${hour}:${minute} using cron "${cronTime}"`);
    });
}

// --------------------- Main Function --------------------- //
async function main() {
    const sock = await startWhatsAppBot();
    // No need to call schedulePrayerReminders here, it's called in startWhatsAppBot when connected
}

main();