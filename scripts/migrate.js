require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

async function runMigration() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: Number(process.env.DB_PORT) || 3306,
      multipleStatements: true
    });

    console.log('Connected to MySQL server');

    const dbName = process.env.DB_NAME || 'ballInsightDB';
    if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
      throw new Error(`Invalid DB_NAME "${dbName}". Use letters, numbers, and underscores only.`);
    }

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.query(`USE \`${dbName}\``);
    console.log(`Database "${dbName}" is ready`);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS migration_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationsDir = path.join(__dirname, '../migration');
    // console.log(migrationsDir);
    let files;

    try {
      files = (await fs.readdir(migrationsDir))
        .filter((file) => file.endsWith('.sql'))
        .sort();
      console.log(`📂 ${files.length} migration files found`);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        throw new Error(`Migrations folder not found at "${migrationsDir}".`);
      }
      throw err;
    }

    if (files.length === 0) {
      console.log(`No migration files found in ${migrationsDir}`);
      return;
    }

    console.log(`${files.length} migration files found in ${migrationsDir}`);

    for (const file of files) {
      const [rows] = await connection.query(
        'SELECT 1 FROM migration_history WHERE filename = ? LIMIT 1',
        [file]
      );

      if (rows.length > 0) {
        console.log(`Skipping already applied: ${file}`);
        continue;
      }

      const fullPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(fullPath, 'utf8');

      if (!sql.trim()) {
        await connection.query('INSERT INTO migration_history (filename) VALUES (?)', [file]);
        console.log(`Skipping empty migration: ${file}`);
        continue;
      }

      console.log(`Applying: ${file}`);

      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.query('INSERT INTO migration_history (filename) VALUES (?)', [file]);
        await connection.commit();
        console.log(`Applied: ${file}`);
      } catch (err) {
        await connection.rollback();
        throw new Error(`Failed in "${file}": ${err.message}`);
      }
    }

    console.log('Migration run complete');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
