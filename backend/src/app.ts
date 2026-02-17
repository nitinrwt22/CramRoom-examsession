import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import sessionRoutes from "./routes/session.routes";
import sessionFilesRoutes from "./routes/sessionFiles.routes";
import dashboardRoutes from "./routes/dashboard.routes";

import { authenticateToken } from "./middleware/auth.middleware";

const app = express();

// 1. Global Middleware (CORS, JSON)
app.use(cors());
app.use(express.json());

// Debug logging
app.use((req, res, next) => {
    console.log(`[DEBUG] Incoming Request: ${req.method} ${req.url}`);
    next();
});

// 2. Public Routes (No JWT required)
app.get("/health", (_req, res) => {
    res.json({ status: "CramRoom backend running" });
});

app.use("/auth", authRoutes); // Public auth routes (register, login)

// 3. Protected Routes
// Apply authentication middleware only to routes that require it

app.use("/session", authenticateToken, sessionRoutes);
// Alias for API consistency
app.use("/api/sessions", authenticateToken, sessionRoutes);
app.use("/session", authenticateToken, sessionFilesRoutes);
app.use("/dashboard", authenticateToken, dashboardRoutes);
// Example: app.use("/api/users", userRoutes);

export default app;
