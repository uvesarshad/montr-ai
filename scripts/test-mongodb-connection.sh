#!/bin/bash
# Test MongoDB connection with credentials
# Run this to verify MongoDB authentication is working

set -e

echo "Testing MongoDB Connection"
echo "=========================="
echo ""

# Load environment variables
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
    echo "✅ Loaded environment variables from .env.local"
else
    echo "❌ .env.local not found"
    exit 1
fi

echo ""
echo "MongoDB URI: ${MONGODB_URI}"
echo ""

# Test connection
echo "Testing connection..."
if mongosh "$MONGODB_URI" --quiet --eval "db.runCommand({ ping: 1 })" > /dev/null 2>&1; then
    echo "✅ MongoDB connection successful!"
else
    echo "❌ MongoDB connection failed!"
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Check if MongoDB is running: sudo systemctl status mongod"
    echo "2. Verify credentials in .env.local"
    echo "3. Check MongoDB logs: sudo tail -f /var/log/mongodb/mongod.log"
    exit 1
fi

echo ""
echo "Database information:"
echo "===================="
mongosh "$MONGODB_URI" --quiet --eval "
    print('Database: ' + db.getName());
    print('Collections: ' + db.getCollectionNames().length);
    print('');
    print('Collection counts:');
    db.getCollectionNames().forEach(function(collection) {
        print('  ' + collection + ': ' + db[collection].countDocuments());
    });
"

echo ""
echo "✅ MongoDB is ready for production!"
