require("dotenv").config();
const app = require('./index').app;
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => console.log(`Bricks Agent server started on port ${PORT}`));

// Say out loud, at boot, whether the Firebase credential actually works.
//
// The previous one was deleted at Google's end and nothing here noticed:
// building the credential succeeds offline, so push notifications failed
// silently for months. Non-fatal on purpose — a dead credential should not
// stop the API serving — but it must never again be invisible.
require('./Utils/firebase').verifyAtStartup().catch(() => {});

// Realtime project rooms (builder-centric merge). Attaches to the same HTTP
// server so the live project feed pushes without polling. Safe no-op if
// socket.io is unavailable — see Utils/realtime.js.
try {
    require('./Utils/realtime').init(server);
} catch (e) {
    console.error('realtime init failed (non-fatal):', e.message);
}
