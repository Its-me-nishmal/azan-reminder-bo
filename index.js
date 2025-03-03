const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const cron = require('node-cron');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const http = require('http');

require('http').createServer((req, res) => res.end('Hello, world!')).listen(3000);


// Load prayer times from a JSON file
const prayerTimes = JSON.parse(fs.readFileSync('prayerTimes.json', 'utf-8'));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: Pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        if (qr) {
            // Display the QR code in the terminal
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            // Wrap the reconnection in try-catch to handle errors
        try {
            await startBot();
          } catch (error) {
            console.error("Error reconnecting:", error);
            // Optionally, you can retry after a delay:
            setTimeout(startBot, 5000);
          }
        } else if (connection === 'open') {
            console.log('Bot connected! ✅');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        // Manage subscriptions via simple commands
        if (text?.toLowerCase() === 'start') {
            let subscribers = fs.existsSync('subscribers.json')
                ? JSON.parse(fs.readFileSync('subscribers.json', 'utf-8'))
                : [];
            if (!subscribers.includes(sender)) {
                subscribers.push(sender);
                fs.writeFileSync('subscribers.json', JSON.stringify(subscribers));
            }
            await sock.sendMessage(sender, { text: 'You have subscribed to prayer time reminders! ✅' });
        } else if (text?.toLowerCase() === 'stop') {
            let subscribers = fs.existsSync('subscribers.json')
                ? JSON.parse(fs.readFileSync('subscribers.json', 'utf-8'))
                : [];
            subscribers = subscribers.filter(sub => sub !== sender);
            fs.writeFileSync('subscribers.json', JSON.stringify(subscribers));
            await sock.sendMessage(sender, { text: 'You have unsubscribed from prayer time reminders. ❌' });
        } else if (text?.toLowerCase() === 'list') {
            // Get today's prayer times
            const now = new Date();
            const currentMonth = now.toLocaleString('default', { month: 'long' });
            const currentDay = now.getDate();
    
            if (!prayerTimes[currentMonth]) {
                await sock.sendMessage(sender, { text: `Prayer times for ${currentMonth} not found.` });
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
                await sock.sendMessage(sender, { text: `Prayer times for day ${currentDay} not found in month ${currentMonth}.` });
                return;
            }
    
            const todaysPrayerTimes = monthTimes[dayRangeKey];
    
            // Format prayer times
            let prayerTimesText = `📅 *Today's Prayer Times*\n\n`;
            Object.entries(todaysPrayerTimes).forEach(([prayer, time]) => {
                prayerTimesText += `🕌 *${prayer}*: ${time}\n`;
            });

            let subscribers = fs.existsSync('subscribers.json')
                ? JSON.parse(fs.readFileSync('subscribers.json', 'utf-8'))
                : [];
    
            prayerTimesText += `\n👥 *Active Subscribers*: ${subscribers.length}`;
    
            // Send prayer times and subscriber count
            await sock.sendMessage(sender, { text: prayerTimesText });
        }
    });

    // Schedule prayer reminders based on current date
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
    const timeZone = 'Asia/Kolkata';

    // Schedule a cron job for each prayer time
    Object.entries(todaysPrayerTimes).forEach(([prayer, timeValue]) => {
        const timeStr = timeValue.toFixed(2);
        const parts = timeStr.split('.');
        let hour = parts[0];
        let minute = parts[1] || "00";
        if (minute.length === 1) minute = '0' + minute;
        const cronTime = `${minute} ${hour} * * *`;
        cron.schedule(cronTime, async () => {
            const msg = [{
                "Subah": [
                    {
                        "message": "ഫജ്‌ർ നമസ്കാരം! പ്രഭാതത്തിലെ ഖുർആൻ പാരായണം സാക്ഷ്യം വഹിക്കപ്പെടുന്നതാണ്. ഈ പുലരിയിൽ ഖുർആൻ പാരായണം ചെയ്ത് അല്ലാഹുവിൻ്റെ അനുഗ്രഹം തേടാം."
                    },
                    {
                        "message": "റമദാനിലെ ഈ പ്രഭാതത്തിൽ, ഫജ്‌റിൻ്റെ ശാന്തതയിൽ നബി(സ) പറഞ്ഞു: രണ്ട് റക്അത്ത് ഫജ്‌ർ നമസ്കാരം, ഈ ലോകത്തേക്കാളും അതിലുള്ളതിനേക്കാളും ഉത്തമമാണ്. ഈ പുണ്യത്തിൽ പങ്കുചേരാം."
                    },
                    {
                        "message": "ഫജ്‌ർ സമയം! അല്ലാഹുവിൻ്റെ സ്മരണയിൽ ഒരു പുതിയ ദിനം ആരംഭിക്കാം. നിങ്ങളുടെ രക്ഷിതാവിനെ മനസ്സിൽ വിനയത്തോടും ഭയത്തോടും കൂടി ശബ്ദമുയർത്താതെ രാവിലെയും വൈകുന്നേരവും സ്മരിക്കുക."
                    },
                    {
                        "message": "ഫജ്‌ർ നമസ്കാരം! ഈ പുലരിയിൽ, നിങ്ങളുടെ ഹൃദയത്തിലെ നന്മകളെ ഉണർത്തുക. ഈ ദിവസം നിങ്ങൾക്ക് അനുകൂലമാവട്ടെ."
                    },
                    {
                        "message": "ഫജ്‌ർ! ഈ പ്രഭാതത്തിൽ, നിങ്ങളുടെ പ്രിയപ്പെട്ടവർക്ക് വേണ്ടി പ്രാർത്ഥിക്കുക. അവരുടെ സന്തോഷത്തിനായി അല്ലാഹുവിനോട് അപേക്ഷിക്കുക."
                    },
                    {
                        "message": "പുലരിയുടെ ശാന്തതയിൽ, ഫജ്‌ർ നമസ്കാരത്തിലൂടെ ഹൃദയം ദൈവസ്മരണയിൽ ലയിപ്പിക്കാം. ഈ ദിനം അനുഗ്രഹപൂർണ്ണമാകട്ടെ."
                    },
                    {
                        "message": "ഫജ്‌ർ നമസ്കാരം! പ്രഭാതത്തിലെ ഈ ശാന്തതയിൽ, മനസ്സിനെ ശുദ്ധീകരിക്കാം. ഒരു പുതിയ തുടക്കത്തിനായി തയ്യാറെടുക്കാം."
                    },
                    {
                        "message": "നബി(സ) പറഞ്ഞു: ആരെങ്കിലും ഫജ്‌ർ നമസ്കരിച്ചാൽ അവൻ അല്ലാഹുവിൻ്റെ സംരക്ഷണത്തിലായി. ഈ സംരക്ഷണം നേടാം."
                    },
                    {
                        "message": "ഫജ്‌ർ നമസ്കാരം! ഈ പുലരിയിൽ, നിങ്ങളുടെ തെറ്റുകൾ ഓർത്ത് പശ്ചാത്തപിക്കുക. നല്ല ചിന്തകളോടെ മുന്നോട്ട് പോകാനായി അല്ലാഹുവിനോട് പ്രാർത്ഥിക്കുക."
                    },
                    {
                        "message": "ഫജ്‌ർ! ഈ പുലരിയിൽ, അല്ലാഹുവിൻ്റെ അനുഗ്രഹം തേടാം. ഈ ദിവസം നല്ല തുടക്കമാകട്ടെ."
                    }
                ]
            }, {
                "Luhar": [
                    {
                        "message": "ളുഹർ നമസ്കാരം! നമസ്കാരം നിലനിർത്തുക തീർച്ചയായും നമസ്കാരം നീചവും നിഷിദ്ധവുമായ കാര്യങ്ങളിൽ നിന്ന് തടയുന്നു. ഈ ഉച്ചസമയത്ത്, നമ്മുടെ കടമകളെക്കുറിച്ച് ചിന്തിക്കാം."
                    },
                    {
                        "message": "റമദാനിലെ ഈ ഉച്ചയിൽ, ളുഹർ നമസ്കാരത്തിലൂടെ നബി(സ) പറഞ്ഞു: സമയം തെറ്റാതെ നമസ്‌കരിക്കുന്നവൻ്റെ ജീവിതത്തിൽ അല്ലാഹു ബർകത്ത് നൽകും. ഈ അനുഗ്രഹം നേടാൻ ശ്രമിക്കാം."
                    },
                    {
                        "message": "ളുഹർ സമയം! അല്ലാഹുവിൻ്റെ സ്മരണയിൽ നമ്മുടെ മനസ്സിനെ ശാന്തമാക്കാം. നിങ്ങൾ അല്ലാഹുവിനെ ധാരാളമായി സ്മരിക്കുക. നിങ്ങൾക്ക് വിജയം പ്രതീക്ഷിക്കാം."
                    },
                    {
                        "message": "ളുഹർ നമസ്കാരം! ഈ ഉച്ചസമയത്ത്, നിങ്ങളുടെ തിരക്കുകളിൽ നിന്ന് അൽപസമയം മാറ്റി അല്ലാഹുവിനെ ഓർക്കുക. നിങ്ങളുടെ ജീവിതത്തിലെ കടമകളെക്കുറിച്ച് ചിന്തിക്കുക."
                    },
                    {
                        "message": "ളുഹർ! ഈ ഉച്ചസമയത്ത്, നിങ്ങളുടെ ചുറ്റുമുള്ളവർക്ക് വേണ്ടി പ്രാർത്ഥിക്കുക. അവരുടെ സന്തോഷത്തിനായി അല്ലാഹുവിനോട് അപേക്ഷിക്കുക."
                    },
                    {
                        "message": "ഉച്ചവെയിലിൻ്റെ ചൂടിലും, ളുഹർ നമസ്കാരത്തിലൂടെ മനസ്സിനെ ശാന്തമാക്കാം. ഈ സമയം പ്രാർത്ഥനകൾക്ക് മാറ്റിവെക്കാം."
                    },
                    {
                        "message": "ളുഹർ നമസ്കാരം! നോമ്പിൻ്റെ ക്ഷീണത്തിലും, ദൈവസ്മരണയിൽ മുഴുകാം. ഈ സമയം സൽകർമ്മങ്ങൾക്കായി ഉപയോഗിക്കാം."
                    },
                    {
                        "message": "ളുഹർ നമസ്കാരം! ഈ ഉച്ചയിൽ, നിങ്ങളുടെ തെറ്റുകൾ ഓർത്ത് പശ്ചാത്തപിക്കുക. നല്ല ചിന്തകളോടെ മുന്നോട്ട് പോകാനായി അല്ലാഹുവിനോട് പ്രാർത്ഥിക്കുക."
                    },
                    {
                        "message": "ളുഹർ സമയം! ഈ പുണ്യമാസത്തിൽ, നിങ്ങളുടെ ജീവിതത്തിലെ ലക്ഷ്യങ്ങളെക്കുറിച്ച് ചിന്തിക്കുക. നിങ്ങളുടെ സ്വപ്നങ്ങൾ യാഥാർത്ഥ്യമാക്കാൻ അല്ലാഹുവിനോട് പ്രാർത്ഥിക്കുക."
                    },
                    {
                        "message": "ളുഹർ! ഈ ഉച്ചസമയത്ത്, അല്ലാഹുവിൻ്റെ കാരുണ്യം തേടാം. നമ്മുടെ പ്രിയപ്പെട്ടവർക്കും ലോകത്തിനും വേണ്ടി പ്രാർത്ഥിക്കാം."
                    }
                ]
            }, {
                "Asar": [
                    {
                        "message": "അസർ നമസ്കാരം! നമസ്കാരങ്ങൾ സൂക്ഷിക്കുക. പ്രത്യേകിച്ചും മദ്ധ്യ നമസ്കാരം (അസർ). അല്ലാഹുവിൻ്റെ മുമ്പിൽ നിങ്ങൾ ഭയഭക്തിയോടെ നിൽക്കുക. ഈ സായാഹ്നത്തിൽ, നമ്മുടെ ജീവിതത്തിലെ നല്ല കാര്യങ്ങളെ ഓർത്ത് നന്ദി പറയാം."
                    },
                    {
                        "message": "റമദാനിലെ ഈ സായാഹ്നത്തിൽ, അസർ നമസ്കാരത്തിലൂടെ നബി(സ) പറഞ്ഞു: ആരെങ്കിലും അസർ നമസ്കാരം ഒഴിവാക്കിയാൽ അവൻ്റെ കർമ്മങ്ങൾ നഷ്ടപ്പെട്ടു. ഈ സമയം പ്രാർത്ഥനകൾക്ക് മാറ്റിവെക്കാം."
                    },
                    {
                        "message": "അസർ സമയം! അല്ലാഹുവിൻ്റെ സ്മരണയിൽ നമ്മുടെ മനസ്സിനെ ശാന്തമാക്കാം. ക്ഷമയോടെയും നമസ്കാരത്തിലൂടെയും നിങ്ങൾ സഹായം തേടുക. തീർച്ചയായും അല്ലാഹു ക്ഷമിക്കുന്നവരോടൊപ്പമാണ്."
                    },
                    {
                        "message": "അസർ നമസ്കാരം! ഈ സായാഹ്നത്തിൽ, നിങ്ങളുടെ ജീവിതത്തിലെ നല്ല കാര്യങ്ങളെ ഓർത്ത് നന്ദി പറയുക. അല്ലാഹുവിൻ്റെ അനുഗ്രഹത്തിന് നന്ദി പറയുക."
                    },
                    {
                        "message": "അസർ! ഈ സായാഹ്നത്തിൽ, നിങ്ങളുടെ ചുറ്റുമുള്ളവർക്ക് വേണ്ടി പ്രാർത്ഥിക്കുക. അവരുടെ സന്തോഷത്തിനായി അല്ലാഹുവിനോട് അപേക്ഷിക്കുക."
                    },
                    {
                        "message": "സായാഹ്നത്തിൻ്റെ മനോഹാരിതയിൽ, അസർ നമസ്കാരത്തിലൂടെ അല്ലാഹുവിനെ സ്മരിക്കാം. ഈ സമയം ദുആകൾക്ക് ഉത്തരം ലഭിക്കുന്നതാകട്ടെ."
                    },
                    {
                        "message": "അസർ നമസ്കാരം! നോമ്പിൻ്റെ ക്ഷീണത്തിലും, ദൈവസ്മരണയിൽ മുഴുകാം. ഈ സമയം സൽകർമ്മങ്ങൾക്കായി ഉപയോഗിക്കാം."
                    },
                    {
                        "message": "അസർ നമസ്കാരം! ഈ സായാഹ്നത്തിൽ, നിങ്ങളുടെ തെറ്റുകൾ ഓർത്ത് പശ്ചാത്തപിക്കുക. നല്ല ചിന്തകളോടെ മുന്നോട്ട് പോകാനായി അല്ലാഹുവിനോട് പ്രാർത്ഥിക്കുക."
                    },
                    {
                        "message": "അസർ സമയം! ഈ പുണ്യമാസത്തിൽ, നിങ്ങളുടെ ജീവിതത്തിലെ ലക്ഷ്യങ്ങളെക്കുറിച്ച് ചിന്തിക്കുക. നിങ്ങളുടെ സ്വപ്നങ്ങൾ യാഥാർത്ഥ്യമാക്കാൻ അല്ലാഹുവിനോട് പ്രാർത്ഥിക്കുക."
                    },
                    {
                        "message": "അസർ! ഈ സായാഹ്നത്തിൽ, അല്ലാഹുവിൻ്റെ കാരുണ്യം തേടാം. നമ്മുടെ പ്രിയപ്പെട്ടവർക്കും ലോകത്തിനും വേണ്ടി പ്രാർത്ഥിക്കാം."
                    }
                ]
            }, {
                "Maghrib": [
                    {
                        "message": "മഗ്‌രിബ് നമസ്കാരം! നോമ്പ് തുറക്കുമ്പോൾ ദുആക്ക് ഉത്തരം ലഭിക്കും. ഈ സന്ധ്യയിൽ, നമ്മുടെ നോമ്പ് തുറക്കാം. അല്ലാഹുവിൻ്റെ അനുഗ്രഹത്തിന് നന്ദി പറയാം."
                    },
                    {
                        "message": "റമദാനിലെ ഈ സന്ധ്യയിൽ, മഗ്‌രിബ് നമസ്കാരത്തിലൂടെ നബി(സ) പറഞ്ഞു: നോമ്പുകാരന് നോമ്പ് തുറക്കുമ്പോൾ സന്തോഷമുണ്ട്. ഈ സന്തോഷം പങ്കിടാം."
                    },
                    {
                        "message": "മഗ്‌രിബ് സമയം! അല്ലാഹുവിൻ്റെ സ്മരണയിൽ നമ്മുടെ മനസ്സിനെ ശാന്തമാക്കാം. നിങ്ങളുടെ രക്ഷിതാവിനെ നിങ്ങൾ വിളിച്ച് പ്രാർത്ഥിക്കുക. തീർച്ചയായും അവൻ പ്രാർത്ഥനക്ക് ഉത്തരം നൽകുന്നവനാണ്."
                    },
                    {
                        "message": "മഗ്‌രിബ് നമസ്കാരം! ഈ സന്ധ്യയിൽ, നിങ്ങളുടെ നോമ്പ് തുറക്കുക. അല്ലാഹുവിൻ്റെ അനുഗ്രഹത്തിന് നന്ദി പറയുക. നിങ്ങളുടെ കുടുംബത്തോടൊപ്പം സന്തോഷം പങ്കിടുക."
                    },
                    {
                        "message": "മഗ്‌രിബ്! ഈ സന്ധ്യയിൽ, നിങ്ങളുടെ ചുറ്റുമുള്ളവർക്ക് വേണ്ടി പ്രാർത്ഥിക്കുക. അവരുടെ സന്തോഷത്തിനായി അല്ലാഹുവിനോട് അപേക്ഷിക്കുക."
                    },
                    {
                        "message": "സന്ധ്യയുടെ മനോഹാരിതയിൽ, മഗ്‌രിബ് നമസ്കാരത്തിലൂടെ നോമ്പ് തുറക്കാം. ഈ സമയം പ്രാർത്ഥനകൾക്ക് ഉത്തരം ലഭിക്കുന്നതാകട്ടെ."
                    },
                    {
                        "message": "മഗ്‌രിബ് നമസ്കാരം! നോമ്പ് തുറക്കുന്ന ഈ വേളയിൽ, ദൈവസ്മരണയിൽ മുഴുകാം. ഈ സമയം സൽകർമ്മങ്ങൾക്കായി ഉപയോഗിക്കാം."
                    },
                    {
                        "message": "മഗ്‌രിബ് നമസ്കാരം! ഈ സന്ധ്യയിൽ, നിങ്ങളുടെ തെറ്റുകൾ ഓർത്ത് പശ്ചാത്തപിക്കുക. നല്ല ചിന്തകളോടെ നോമ്പ് തുറക്കുക."
                    },
                    {
                        "message": "മഗ്‌രിബ് സമയം! ഈ പുണ്യമാസത്തിൽ, നോമ്പ് തുറക്കുന്നതിൻ്റെ പ്രാധാന്യത്തെക്കുറിച്ച് ചിന്തിക്കുക. നിങ്ങളുടെ ജീവിതത്തിലെ അനുഗ്രഹങ്ങൾക്ക് നന്ദി പറയുക."
                    },
                    {
                        "message": "മഗ്‌രിബ്! ഈ സന്ധ്യയിൽ, അല്ലാഹുവിൻ്റെ കാരുണ്യം തേടാം. നമ്മുടെ പ്രിയപ്പെട്ടവർക്കും ലോകത്തിനും വേണ്ടി പ്രാർത്ഥിക്കാം."
                    }
                ]
            }, {
                "Isha": [
                    {
                        "message": "ഇഷാ നമസ്കാരം! ആരെങ്കിലും ഇഷാ നമസ്കാരം ജമാഅത്തായി നിർവഹിച്ചാൽ, അവൻ രാത്രിയുടെ പകുതി നമസ്കരിച്ചവനെപ്പോലെയാണ്. ഈ രാത്രിയിൽ, തറാവീഹ് നമസ്കാരത്തിൽ പങ്കെടുക്കാം."
                    },
                    {
                        "message": "റമദാനിലെ ഈ രാത്രിയിൽ, ഇഷാ നമസ്കാരത്തിലൂടെ നബി(സ) പറഞ്ഞു: നിങ്ങൾ തറാവീഹ് നമസ്കരിക്കുക. അല്ലാഹു നിങ്ങൾക്കുള്ള പാപങ്ങൾ പൊറുത്തുതരും. ഖുർആൻ പാരായണം ചെയ്യാം."
                    },
                    {
                        "message": "ഇഷാ സമയം! അല്ലാഹുവിൻ്റെ സ്മരണയിൽ നമ്മുടെ മനസ്സിനെ ശാന്തമാക്കാം. നിങ്ങൾ അല്ലാഹുവിനെ സ്മരിക്കുമ്പോൾ നിങ്ങളുടെ ഹൃദയങ്ങൾ ശാന്തമാവുന്നു."
                    },
                    {
                        "message": "ഇഷാ നമസ്കാരം! ഈ രാത്രിയിൽ, തറാവീഹ് നമസ്കാരത്തിൽ പങ്കെടുക്കുക. അല്ലാഹുവിൻ്റെ അനുഗ്രഹം തേടുക. നിങ്ങളുടെ ജീവിതത്തിലെ സമാധാനത്തിനായി പ്രാർത്ഥിക്കുക."
                    },
                    {
                        "message": "ഇഷാ! ഈ രാത്രിയിൽ, നിങ്ങളുടെ ചുറ്റുമുള്ളവർക്ക് വേണ്ടി പ്രാർത്ഥിക്കുക. അവരുടെ സന്തോഷത്തിനായി അല്ലാഹുവിനോട് അപേക്ഷിക്കുക."
                    },
                    {
                        "message": "രാത്രിയുടെ ശാന്തതയിൽ, ഇഷാ നമസ്കാരത്തിലൂടെ തറാവീഹ് നമസ്കാരത്തിൽ പങ്കെടുക്കാം. ഈ സമയം പ്രാർത്ഥനകൾക്ക് ഉത്തരം ലഭിക്കുന്നതാകട്ടെ."
                    },
                    {
                        "message": "ഇഷാ നമസ്കാരം! ഈ വേളയിൽ, ദൈവസ്മരണയിൽ മുഴുകാം. തറാവീഹ് നമസ്കാരത്തിൽ പങ്കെടുക്കാം."
                    },
                    {
                        "message": "ഇഷാ നമസ്കാരം! ഈ രാത്രിയിൽ, നിങ്ങളുടെ തെറ്റുകൾ ഓർത്ത് പശ്ചാത്തപിക്കുക. നല്ല ചിന്തകളോടെ ഉറങ്ങുക."
                    },
                    {
                        "message": "ഇഷാ സമയം! ഈ പുണ്യമാസത്തിൽ, രാത്രിയുടെ ശാന്തതയിൽ അല്ലാഹുവിനെ ഓർക്കുക. നിങ്ങളുടെ ജീവിതത്തിലെ സന്തോഷത്തിനായി പ്രാർത്ഥിക്കുക."
                    },
                    {
                        "message": "ഇഷാ! ഈ രാത്രിയിൽ, അല്ലാഹുവിൻ്റെ കാരുണ്യം തേടാം. നമ്മുടെ പ്രിയപ്പെട്ടവർക്കും ലോകത്തിനും വേണ്ടി പ്രാർത്ഥിക്കാം."
                    }
                ]
            },

            ]
            const prayerObj = msg.find(obj => obj[prayer]);

            if (prayerObj) {
                const prayerMessages = prayerObj[prayer];

                // Select a random message
                var randomMessage = prayerMessages[Math.floor(Math.random() * prayerMessages.length)].message;
            } else {
                randomMessage = "ok";
            }
            let subscribers = fs.existsSync('subscribers.json')
                ? JSON.parse(fs.readFileSync('subscribers.json', 'utf-8'))
                : [];
                for (const subscriber of subscribers) {
                    const delay = Math.floor(Math.random() * 2000) + 2000; // Random delay between 2000ms (2s) to 4000ms (4s)
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    await sock.sendMessage(subscriber, { text: randomMessage });
                }
        },{timezone:timeZone});
        console.log(`Scheduled ${prayer} reminder at ${hour}:${minute} using cron "${cronTime}"`);
    });
}

startBot();

// Run health check every 1 minute
cron.schedule('* * * * *', () => {
    console.log(`📢 Health check performed at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
});

const checkHealth = () => {
    http.get('https://azan-reminder-bo.onrender.com', (res) => {
        let data = '';

        res.on('data', chunk => data += chunk);
        res.on('end', () => console.log(`📢 Health Check: ${data}`));
    }).on('error', (err) => {
        console.error('❌ Health Check Failed:', err.message);
    });
};

// Run health check every 1 minute
setInterval(checkHealth, 60 * 1000);


