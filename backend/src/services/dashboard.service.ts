
import pool from '../config/database';

export interface DashboardStats {
    participantActive: number;
    participantExpired: number;
    hostedSessions: number;
    uploadedFiles: number;
}

/**
 * Retrieves dashboard statistics for a specific user.
 * 
 * @param userId - The ID of the user
 * @returns DashboardStats object containing counts
 */
export const getUserDashboard = async (userId: number): Promise<DashboardStats> => {
    // Query 1: Participant sessions counts (active vs expired)
    const participantStatsQuery = `
        SELECT 
            COUNT(*) FILTER (WHERE s.status = 'active') as active_count,
            COUNT(*) FILTER (WHERE s.status = 'expired') as expired_count
        FROM sessions s
        JOIN participants p ON s.id = p.session_id
        WHERE p.user_id = $1
    `;

    // Query 2: Hosted sessions count
    const hostedStatsQuery = `
        SELECT COUNT(*) as host_count
        FROM sessions
        WHERE host_id = $1
    `;

    // Query 3: Uploaded files count
    const filesStatsQuery = `
        SELECT COUNT(*) as file_count
        FROM session_files
        WHERE uploaded_by = $1
    `;

    try {
        const [participantRes, hostedRes, filesRes] = await Promise.all([
            pool.query(participantStatsQuery, [userId]),
            pool.query(hostedStatsQuery, [userId]),
            pool.query(filesStatsQuery, [userId])
        ]);

        return {
            participantActive: parseInt(participantRes.rows[0].active_count || '0', 10),
            participantExpired: parseInt(participantRes.rows[0].expired_count || '0', 10),
            hostedSessions: parseInt(hostedRes.rows[0].host_count || '0', 10),
            uploadedFiles: parseInt(filesRes.rows[0].file_count || '0', 10)
        };

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        throw new Error('Failed to fetch dashboard statistics');
    }
};
