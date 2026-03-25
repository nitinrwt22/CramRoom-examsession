const { Pool } = require('pg');
const pool = new Pool({});
async function run() {
  const { rows: files } = await pool.query("SELECT id, title, content_type FROM files ORDER BY id DESC LIMIT 5");
  console.log("FILES:", files);
  const { rows: chunks } = await pool.query("SELECT id, session_id, file_id, topic, marks, year FROM session_ai_chunks ORDER BY id DESC LIMIT 5");
  console.log("CHUNKS:", chunks);
  pool.end();
}
run();
