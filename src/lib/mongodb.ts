import { MongoClient, Db } from 'mongodb';
import mongoose from 'mongoose';

// Use fallback to localhost if MONGODB_URI not set
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/montrai';
const options = {
    maxPoolSize: 10,
    minPoolSize: 2,
    // 5s flaked on SRV/DNS-slow machines (TLS interception) — worker boots
    // intermittently failed server selection while plain scripts connected
    // fine. Overridable for constrained environments.
    serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '20000', 10),
    socketTimeoutMS: 45000,
};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
    // In development mode, use a global variable to preserve the connection
    // across module reloads caused by HMR (Hot Module Replacement)
    const globalWithMongo = global as typeof globalThis & {
        _mongoClientPromise?: Promise<MongoClient>;
    };

    if (!globalWithMongo._mongoClientPromise) {
        client = new MongoClient(uri, options);
        globalWithMongo._mongoClientPromise = client.connect();
    }
    clientPromise = globalWithMongo._mongoClientPromise;
} else {
    // In production mode, create a new client for each connection
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
}

/**
 * Get MongoDB client
 * @returns Promise<MongoClient>
 */
export async function getMongoClient(): Promise<MongoClient> {
    return clientPromise;
}

/**
 * Get MongoDB database instance
 * @returns Promise<Db>
 */
export async function getDatabase(): Promise<Db> {
    const client = await getMongoClient();
    return client.db(process.env.MONGODB_DB_NAME || 'montrai');
}

/**
 * Connect Mongoose to MongoDB
 * This is required for Mongoose models to work
 */
let mongooseConnection: typeof mongoose | null = null;

export async function connectMongoose(): Promise<typeof mongoose> {
    if (mongooseConnection && mongoose.connection.readyState === 1) {
        return mongooseConnection;
    }

    try {
        mongooseConnection = await mongoose.connect(uri, {
            dbName: process.env.MONGODB_DB_NAME || 'montrai',
        });
        console.log('✅ Mongoose connected to MongoDB');
        return mongooseConnection;
    } catch (error) {
        console.error('❌ Mongoose connection failed:', error);
        throw error;
    }
}

/**
 * Health check for MongoDB connection
 * @returns Promise<boolean>
 */
export async function checkMongoConnection(): Promise<boolean> {
    try {
        const client = await getMongoClient();
        await client.db('admin').command({ ping: 1 });
        console.log('✅ MongoDB connection successful');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        return false;
    }
}

export default clientPromise;

// Alias for backwards compatibility - repositories use connectDB
export const connectDB = connectMongoose;
