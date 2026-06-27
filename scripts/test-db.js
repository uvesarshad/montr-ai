const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

if (!uri) {
    console.error('❌ MONGODB_URI is not defined in .env');
    process.exit(1);
}

console.log(`Testing connection to: ${uri.replace(/:([^:@]+)@/, ':****@')}`); // Hide password

const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
});

async function run() {
    try {
        console.log('Attempting to connect...');
        await client.connect();
        console.log('✅ Connected successfully to MongoDB!');

        const db = client.db();
        console.log(`Using database: ${db.databaseName}`);

        const collections = await db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));

    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        if (err.cause) console.error('Cause:', err.cause);
    } finally {
        await client.close();
    }
}

run();
