-- Migration for Session-Based Chat Backend

CREATE TABLE IF NOT EXISTS messages (
    message_id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(255) NOT NULL,
    message_text TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

