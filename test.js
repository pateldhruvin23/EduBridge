const pool = require("./config/db");

async function testDB() {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("Connected ✅", res.rows[0]);
  } catch (err) {
    console.error("Error ❌", err);
  }
}

testDB();