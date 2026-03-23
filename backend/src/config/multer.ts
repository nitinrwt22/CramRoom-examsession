import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = 'uploads/session-files';

// Ensure the upload directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    },
});

export const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

// In-memory multer for markdown knowledge files (no disk write needed)
export const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit for .md files
    },
    fileFilter: (_req, file, cb) => {
        if (
            file.mimetype === 'text/markdown' ||
            file.originalname.endsWith('.md')
        ) {
            cb(null, true);
        } else {
            cb(new Error('Only .md (Markdown) files are allowed for knowledge upload'));
        }
    },
});
