📚 CramRoom — Time-Bound Collaborative Exam Prep Platform

CramRoom is a backend-first collaborative exam preparation platform designed for short, focused study sessions.
It enables students to create time-limited sessions, collaborate with peers, share resources, and automatically expire sessions after the exam window.

This project emphasizes clean backend architecture, real-world constraints, and correctness over UI polish.

🚀 Core Idea

A time-bound collaborative exam preparation platform where students create short-lived study sessions (1–3 days) and prepare together using shared resources, structured session logic, and automated expiry handling.

✨ Features (Implemented)
🔐 Authentication

User registration & login

Password hashing

JWT-based authentication

Protected routes (GET & POST)

🧠 Session Management

Create study sessions with subject & expiry time

Join sessions via session ID

Leave sessions

Host-specific logic:

If host leaves → session automatically expires

Role awareness (host vs participant)

⏱️ Session Expiry Automation

Expiry timestamp stored per session

Background cron job checks expired sessions

Automatic status change: active → expired

Expired sessions cannot be joined

📋 Session Visibility APIs

View all sessions the user is part of

View only active sessions

Fetch session details securely

Correct handling of GET vs POST routes

📁 Session Files / Resources

Upload files per session (PDFs, notes, images, etc.)

Local disk storage with Multer

File metadata stored in PostgreSQL

List session files

Delete files with access control:

Uploader OR session host only

🛠️ Tech Stack

Backend

Node.js

Express.js

TypeScript

Database

PostgreSQL

Auth & Security

JWT

bcrypt

File Handling

Multer

Local filesystem (V1)

Automation

node-cron

🧱 Architecture Overview
routes  →  services  →  database
        ↘ middleware ↙


Business logic lives in services

Routes are thin & declarative

Middleware handles auth & validation

Database is the single source of truth

📂 Project Structure (Simplified)
src/
 ├── routes/
 ├── services/
 ├── middleware/
 ├── cron/
 ├── config/
 ├── uploads/
 └── index.ts

🧪 Testing

APIs tested using Postman

Manual DB verification using psql

Edge cases covered:

Unauthorized access

Expired sessions

Duplicate joins

Invalid routes

File permission checks

🎯 Design Decisions

Backend-first approach

No overengineering in V1

No frontend assumptions

Expiry handled both logically (API) and automatically (cron)

Files stored on disk, metadata in DB (scalable to S3 later)

🔮 Future Scope

File download endpoints

Frontend integration

Shared AI assistant per session

Realtime chat

Cloud storage (S3)

Notifications & reminders

👤 Author

Nitin Rawat
B.Tech CSE
Backend-focused project built for learning, correctness, and real-world readiness.
