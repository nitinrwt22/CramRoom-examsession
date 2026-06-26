import pool from '../config/database';
import fs from 'fs';
import path from 'path';

export const uploadSessionFile = async (
    sessionId: number,
    userId: number,
    file: Express.Multer.File
) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verify session exists and is active
        const sessionQuery = `
      SELECT id, status, expiry_time
      FROM sessions
      WHERE id = $1
    `;
        const sessionResult = await client.query(sessionQuery, [sessionId]);

        if (sessionResult.rows.length === 0) {
            throw new Error('Session not found');
        }

        const session = sessionResult.rows[0];
        const now = new Date();

        if (session.status !== 'active' || new Date(session.expiry_time) <= now) {
            throw new Error('Session is not active or has expired');
        }

        // 2. Verify user is a participant
        // Note: Assuming host is also in participants table or we should implicitly allow host.
        // The requirement says "Verify user is a participant". We strictly check the participants table.
        const participantQuery = `
      SELECT 1
      FROM session_members
      WHERE session_id = $1 AND user_id = $2
    `;
        const participantResult = await client.query(participantQuery, [sessionId, userId]);

        if (participantResult.rows.length === 0) {
            // Optional: Check if user is host if they are not in participants (depends on logic),
            // but strict requirement is "Verify user is a participant".
            throw new Error('User is not a participant in this session');
        }

        // 3. Insert file metadata into session_files
        const insertQuery = `
      INSERT INTO session_files (
        session_id,
        uploaded_by,
        original_name,
        stored_name,
        mime_type,
        size
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

        const insertValues = [
            sessionId,
            userId,
            file.originalname,
            file.filename,
            file.mimetype,
            file.size,
        ];

        const insertResult = await client.query(insertQuery, insertValues);

        await client.query('COMMIT');

        return insertResult.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const getSessionFiles = async (sessionId: number, userId: number) => {
    // 1. Verify session exists
    const sessionQuery = 'SELECT id FROM sessions WHERE id = $1';
    const sessionResult = await pool.query(sessionQuery, [sessionId]);

    if (sessionResult.rows.length === 0) {
        throw new Error('Session not found');
    }

    // 2. Verify user is a participant
    const participantQuery = 'SELECT 1 FROM session_members WHERE session_id = $1 AND user_id = $2';
    const participantResult = await pool.query(participantQuery, [sessionId, userId]);

    if (participantResult.rows.length === 0) {
        throw new Error('User is not a participant in this session');
    }

    // 3. Fetch files
    // Assuming created_at exists (standard practice). If not, we might need to adjust.
    // Also selecting all metadata columns requested.
    const filesQuery = `
    SELECT id, session_id, uploaded_by, original_name, stored_name, mime_type, size, created_at
    FROM session_files
    WHERE session_id = $1
    ORDER BY created_at DESC
  `;
    const filesResult = await pool.query(filesQuery, [sessionId]);


    return filesResult.rows;
};

export const deleteSessionFile = async (fileId: number, userId: number) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Fetch file record
        const fileQuery = 'SELECT * FROM session_files WHERE id = $1';
        const fileResult = await client.query(fileQuery, [fileId]);

        if (fileResult.rows.length === 0) {
            throw new Error('File not found');
        }

        const file = fileResult.rows[0];

        // 2. Fetch associated session to check host
        const sessionQuery = 'SELECT host_id FROM sessions WHERE id = $1';
        const sessionResult = await client.query(sessionQuery, [file.session_id]);

        if (sessionResult.rows.length === 0) {
            // Should verify data integrity, but purely for logic:
            throw new Error('Associated session not found');
        }

        const session = sessionResult.rows[0];

        // 3. Verify permissions (uploader or host)
        if (file.uploaded_by !== userId && session.host_id !== userId) {
            throw new Error('Unauthorized: You can only delete your own files or if you are the host');
        }

        // 4. Delete DB record
        const deleteQuery = 'DELETE FROM session_files WHERE id = $1';
        await client.query(deleteQuery, [fileId]);

        await client.query('COMMIT');

        // 5. Delete file from disk
        // Construct path - assuming 'uploads/session-files' relative to CWD
        // We could import uploadDir from config, but to avoid circular deps if any or just refactor, 
        // I will use the known path 'uploads/session-files'.
        const filePath = path.join(process.cwd(), 'uploads/session-files', file.stored_name);

        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (fsError) {
            console.error(`Failed to delete file from disk: ${filePath}`, fsError);
            // We do not throw here, as DB record is already gone.
        }

        return { message: 'File deleted successfully' };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const downloadSessionFile = async (fileId: number, userId: number) => {
    // 1. Fetch file metadata
    const fileResult = await pool.query('SELECT * FROM session_files WHERE id = $1', [fileId]);

    if (fileResult.rows.length === 0) {
        throw new Error('File not found');
    }

    const file = fileResult.rows[0];

    // 2. Fetch related session
    const sessionResult = await pool.query('SELECT * FROM sessions WHERE id = $1', [file.session_id]);

    if (sessionResult.rows.length === 0) {
        throw new Error('Session not found');
    }

    // 3. Verify user is a participant
    const participantResult = await pool.query(
        'SELECT 1 FROM session_members WHERE session_id = $1 AND user_id = $2',
        [file.session_id, userId]
    );

    if (participantResult.rows.length === 0) {
        throw new Error('User is not a participant in this session');
    }

    // 4. Verify file exists on disk
    const absolutePath = path.join(process.cwd(), 'uploads/session-files', file.stored_name);

    if (!fs.existsSync(absolutePath)) {
        throw new Error('File not found on disk');
    }

    // 5. Return
    return {
        absolutePath,
        mimeType: file.mime_type,
        originalName: file.original_name,
    };
};
