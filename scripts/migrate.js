require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

async function runMigration() {
  let connection;
  
  try {
    // First connect without database to create it if it doesn't exist
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306
    });

    console.log('📦 Connected to MySQL server');

    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'ballInsightDB';
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
    console.log(`✅ Database '${dbName}' created or already exists`);

    // Switch to the database
    await connection.query(`USE ${dbName}`);

    // Read and execute schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');

    // Split by semicolon and execute each statement
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    console.log(`📝 Executing ${statements.length} SQL statements...`);

    for (const statement of statements) {
      await connection.query(statement);
    }

    console.log('✅ Database schema created successfully!');
    console.log('\n📊 Tables created:');
    console.log('  - teams');
    console.log('  - leagues');
    console.log('  - matches');
    console.log('  - match_events');
    console.log('  - match_statistics');
    console.log('  - analysis_cache');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run migration
runMigration();
