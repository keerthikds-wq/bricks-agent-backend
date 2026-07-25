require("dotenv").config();
const app = require('./index').app;
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => console.log(`Bricks Agent server started on port ${PORT}`));

// Realtime project rooms (builder-centric merge). Attaches to the same HTTP
// server so the live project feed pushes without polling. Safe no-op if
// socket.io is unavailable — see Utils/realtime.js.
try {
    require('./Utils/realtime').init(server);
} catch (e) {
    console.error('realtime init failed (non-fatal):', e.message);
}
