require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcryptjs');
const { query } = require('./config/db');

async function reset() {
  const hash = await bcrypt.hash('password123', 12);
  
  await query('UPDATE users SET password_hash = $1 WHERE email = $2 OR email = $3', 
    [hash, 'superadmin1@gmail.com', 'akshayaamaharishi@gmail.com']
  );
  
  console.log('Passwords reset to password123 successfully.');
  process.exit(0);
}
reset().catch(e => { console.error(e); process.exit(1); });
