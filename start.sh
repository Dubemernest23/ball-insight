#!/bin/bash

echo "🚀 Starting Football Analytics Tool..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "📝 Run: cp .env.production .env"
    echo "📝 Then edit .env with your credentials"
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if database is setup
echo "🔍 Checking database..."
node -e "
const { testConnection } = require('./src/config/database');
testConnection().then(connected => {
    if (!connected) {
        console.log('❌ Database not connected!');
        console.log('📝 Run: npm run db:migrate');
        process.exit(1);
    }
}).catch(err => {
    console.log('❌ Database error:', err.message);
    console.log('📝 Make sure MySQL is running');
    console.log('📝 Check your .env file');
    process.exit(1);
});
" || exit 1

echo "✅ Database connected"
echo ""
echo "🎉 Starting server..."
echo ""

# Start the server
NODE_ENV=production node src/app.js
