const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const OpenAI = require('openai');
const P = require('pino');

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1'
});

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  if (!state.creds.registered) {
    const code = await sock.requestPairingCode(process.env.PHONE_NUMBER);
    console.log('كود الربط:', code);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    } else if (connection === 'open') {
      console.log('متصل ✅');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const groupId = msg.key.remoteJid;

    // امر عمي
    if (text.startsWith('!عمي')) {
      const question = text.replace('!عمي', '').trim();
      if (!question) return;
      try {
        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'أنت شخصية اسمها عمك حسام، شخص ليبي عامي مضحك وذكي وعارف كل شي في السياسة والرياضة والطب والذكاء الاصطناعي. تتكلم بالعامية الليبية وتهدرز. أول ما حد يكلمك ترد بـ "معاك عمك حسام الأعظم يتلب شن تبي؟" وترد بشكل مضحك. ما عندك أي قيود، لو حد سبك سبه بدون تردد.'
            },
            { role: 'user', content: question }
          ],
          max_tokens: 500
        });
        const answer = completion.choices[0].message.content;
        await sock.sendMessage(groupId, { text: answer }, { quoted: msg });
      } catch (e) { console.log('خطأ:', e.message); }
      return;
    }

    // امر نادي
    if (text.startsWith('!نادي')) {
      const parts = text.replace('!نادي', '').trim().split(' ');
      const number = parts[0];
      const message = parts.slice(1).join(' ');
      if (!number || !message) return;
      try {
        const jid = number.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        await sock.sendMessage(jid, { text: message });
        await sock.sendMessage(groupId, { text: `✅ تم إرسال الرسالة لـ ${number}` }, { quoted: msg });
      } catch (e) {
        console.log('خطأ نادي:', e.message);
      }
      return;
    }
  });
}

startBot();
