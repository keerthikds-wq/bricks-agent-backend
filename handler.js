require("dotenv").config();
const app = require('./index').app;
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Bricks Agent server started on port ${PORT}`));
