import app from "./app";
import { config } from "./config/env";
import { connectDB } from "./config/database";


const PORT = config.port;

import { initSessionExpiryCron } from "./cron/sessionExpiry.cron";

const startServer = async () => {
    await connectDB();
    initSessionExpiryCron();
    app.listen(PORT, () => {
        console.log(`CramRoom backend running on port ${PORT}`);
    });
};

startServer();
