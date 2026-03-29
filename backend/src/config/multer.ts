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

// Accepted MIME types for knowledge file uploads
const KNOWLEDGE_MIMETYPES = [
    'text/markdown',
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// In-memory multer for knowledge files (.md, .pdf, .docx)
export const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB limit
    },
    fileFilter: (_req, file, cb) => {
        const name = file.originalname.toLowerCase();
        const isValidExt = name.endsWith('.md') || name.endsWith('.pdf') || name.endsWith('.docx');
        const isValidMime = KNOWLEDGE_MIMETYPES.includes(file.mimetype);

        if (isValidExt || isValidMime) {
            cb(null, true);
        } else {
            cb(new Error('Only .md, .pdf, and .docx files are allowed for knowledge upload'));
        }
    },
});
