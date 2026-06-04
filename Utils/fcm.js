const admin = require('firebase-admin');

// Initialize once — safe to require from multiple controllers
if (!admin.apps.length) {
    try {
        const svcAccount = require('./config.json');
        admin.initializeApp({ credential: admin.credential.cert(svcAccount) });
    } catch (e) {
        console.warn('[FCM] Firebase service account not found — push notifications will be skipped.');
    }
}

async function sendFcm(token, title, body, data = {}) {
    if (!token || token === 'user_logged_out') return false;
    if (!admin.apps.length) return false;
    try {
        await admin.messaging().send({
            notification: { title, body },
            data: { title, body, click_action: 'FLUTTER_NOTIFICATION_CLICK', ...data },
            token,
        });
        return true;
    } catch (e) {
        console.error('[FCM] send error (non-fatal):', e.message);
        return false;
    }
}

async function sendToMany(tokens, title, body, data = {}) {
    const valid = [...new Set(tokens.filter(t => t && t !== 'user_logged_out'))];
    if (!valid.length) return { sent: 0, failed: 0 };
    const results = await Promise.allSettled(valid.map(t => sendFcm(t, title, body, data)));
    const sent = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`[FCM] sendToMany: ${sent}/${valid.length} delivered`);
    return { sent, failed: valid.length - sent };
}

module.exports = { sendFcm, sendToMany };
