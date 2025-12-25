import app from "./app";
import { config } from "./config/env";
import { connectDB } from "./config/database";


const PORT = config.port;

const startServer = async () => {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`CramRoom backend running on port ${PORT}`);
    });
};

startServer();
