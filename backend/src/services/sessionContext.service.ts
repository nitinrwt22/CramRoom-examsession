import pool from '../config/database';
import { getKnowledgeChunksForSession } from '../models/knowledgeChunk.model';

// ------------------------------------------------------------------
// Type Definitions
// ------------------------------------------------------------------

export interface SessionContext {
    sessionMeta: {
        sessionId: string;
        subject: string;
        examDate: Date;
        createdAt: Date;
        expiresAt: Date;
        isExpired: boolean;
    };
    timeContext: {
        timeRemainingInHours: number;
        examInDays: number;
    };
    participants: {
        count: number;
    };
    materials: {
        files: Array<{
            id: string;
            name: string;
            type: 'notes' | 'syllabus' | 'pyq' | 'other';
        }>;
    };
    knowledge: {
        chunks: Array<{
            topic: string;
            text: string;
        }>;
    };
    recentHistory: Array<{
        question: string;
        answer: string;
    }>;
    flags: {
        isActive: boolean;
        uploadsAllowed: boolean;
    };
}

// ------------------------------------------------------------------
// Service Implementation
// ------------------------------------------------------------------

export const buildSessionContext = async (sessionId: string, userId: string): Promise<SessionContext> => {
    const sId = parseInt(sessionId, 10);
    const uId = parseInt(userId, 10);

    if (isNaN(sId) || isNaN(uId)) {
        throw new Error('Invalid session ID or user ID');
    }

    const client = await pool.connect();

    try {
        // 1. Verify User is a Participant
        const participantQuery = `
            SELECT 1 
            FROM participants 
            WHERE session_id = $1 AND user_id = $2
            LIMIT 1;
        `;
        const participantResult = await client.query(participantQuery, [sId, uId]);

        if (participantResult.rowCount === 0) {
            throw new Error('Authorization error: User is not a participant of this session');
        }

        // 2. Fetch Session Core Data
        const sessionQuery = `
            SELECT 
                subject, 
                exam_date, 
                created_at, 
                expiry_time, 
                status 
            FROM sessions 
            WHERE id = $1;
        `;
        const sessionResult = await client.query(sessionQuery, [sId]);

        if (sessionResult.rowCount === 0) {
            throw new Error('Session not found');
        }

        const session = sessionResult.rows[0];

        // 3. Fetch Participant Count
        const countQuery = `
            SELECT COUNT(*)::int as count 
            FROM participants 
            WHERE session_id = $1;
        `;
        const countResult = await client.query(countQuery, [sId]);
        const participantCount = countResult.rows[0]?.count || 0;

        // 4. Fetch Uploaded Files
        const filesQuery = `
            SELECT 
                id, 
                original_name, 
                mime_type 
            FROM session_files 
            WHERE session_id = $1;
        `;
        const filesResult = await client.query(filesQuery, [sId]);

        // 4b. Fetch Knowledge Chunks from uploaded markdown files
        const knowledgeChunks = await getKnowledgeChunksForSession(sId);

        // 4c. Fetch last 5 AI messages as recent conversation memory
        const recentMsgsResult = await client.query(
            `SELECT question, answer
             FROM session_ai_messages
             WHERE session_id = $1
             ORDER BY created_at DESC
             LIMIT 5`,
            [sId]
        );
        const recentHistory = recentMsgsResult.rows.reverse(); // chronological order

        // 5. Process & Calculate Data
        const now = new Date();
        const expiryTime = new Date(session.expiry_time);
        const examDate = new Date(session.exam_date);

        // Determine Flags
        // active if status is 'active' AND strictly not expired by time
        const isExpired = session.status === 'expired' || now > expiryTime;
        const isActive = session.status === 'active' && !isExpired;
        const uploadsAllowed = isActive; // specific rule: uploads allowed if active

        // Calculate Time Context
        // timeRemainingInHours: time until session expires
        const msUntilExpiry = expiryTime.getTime() - now.getTime();
        const timeRemainingInHours = msUntilExpiry > 0
            ? parseFloat((msUntilExpiry / (1000 * 60 * 60)).toFixed(2))
            : 0;

        // examInDays: time until exam date
        const msUntilExam = examDate.getTime() - now.getTime();
        const examInDays = parseFloat((msUntilExam / (1000 * 60 * 60 * 24)).toFixed(1));

        // Process Files
        const files = filesResult.rows.map((file: any) => {
            const name = file.original_name || '';
            const lowerName = name.toLowerCase();

            let type: 'notes' | 'syllabus' | 'pyq' | 'other' = 'other';

            if (lowerName.includes('note')) type = 'notes';
            else if (lowerName.includes('syllabus')) type = 'syllabus';
            else if (lowerName.includes('pyq') || lowerName.includes('paper')) type = 'pyq';

            return {
                id: file.id.toString(), // ensure string as per interface
                name: name,
                type: type
            };
        });

        // 6. Return Structured Context
        return {
            sessionMeta: {
                sessionId: sessionId, // keep original string
                subject: session.subject,
                examDate: session.exam_date,
                createdAt: session.created_at,
                expiresAt: session.expiry_time,
                isExpired: isExpired
            },
            timeContext: {
                timeRemainingInHours,
                examInDays
            },
            participants: {
                count: participantCount
            },
            materials: {
                files
            },
            knowledge: {
                chunks: knowledgeChunks.map((kc) => ({
                    topic: kc.topic,
                    text: kc.chunk_text
                }))
            },
            recentHistory,
            flags: {
                isActive,
                uploadsAllowed
            }
        };

    } catch (error) {
        console.error('Error in buildSessionContext:', error);
        throw error; // Re-throw to be handled by controller
    } finally {
        client.release();
    }
};
