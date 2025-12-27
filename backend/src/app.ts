import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import { authenticateToken } from "./middleware/auth.middleware";

const app = express();

// 1. Global Middleware (CORS, JSON)
app.use(cors());
app.use(express.json());

// 2. Public Routes (No JWT required)
app.get("/health", (_req, res) => {
    res.json({ status: "CramRoom backend running" });
});

app.use("/auth", authRoutes); // Public auth routes (register, login)

// 3. Protected Routes Middleware
// All routes defined after this line will require a valid JWT
app.use(authenticateToken);

// 4. Protected Routes
app.get("/session/my", (req: any, res) => {
    res.json({ user: req.user });
});
// Example: app.use("/api/users", userRoutes);

export default app;
