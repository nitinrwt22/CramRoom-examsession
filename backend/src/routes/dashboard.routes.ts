
import express from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { getUserDashboard } from '../services/dashboard.service';

const router = express.Router();

/**
 * GET /dashboard
 * Returns dashboard statistics for the authenticated user.
 */
router.get('/', async (req: AuthRequest, res) => {
    try {
        const userId = req.user.id;
        const dashboardStats = await getUserDashboard(userId);
        res.status(200).json(dashboardStats);
    } catch (error: any) {
        console.error('Error in /dashboard:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

export default router;
