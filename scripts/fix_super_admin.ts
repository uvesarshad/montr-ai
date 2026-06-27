import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';

// Manual env loading
try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^["']|["']$/g, '');
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
        console.log('.env.local loaded');
    }
} catch (e) {
    console.error('Failed to load env:', e);
}

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined');
    }

    const client = new MongoClient(process.env.MONGODB_URI);

    try {
        await client.connect();
        const dbName = process.env.MONGODB_DB_NAME || 'montrai';
        const db = client.db(dbName);
        const usersCollection = db.collection('users');

        const email = 'superuves@gmail.com';
        const user = await usersCollection.findOne({ email });

        if (!user) {
            console.log(`User ${email} not found.`);
            return;
        }

        console.log(`User found: ${user._id}`);
        console.log('Role:', user.role);
        console.log('Current emailVerified:', user.emailVerified);

        if (!user.emailVerified) {
            console.log('Updating emailVerified...');
            await usersCollection.updateOne(
                { _id: user._id },
                { $set: { emailVerified: new Date() } }
            );
            console.log('✅ User email verified manually.');
        } else {
            console.log('User is already verified.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

main();
