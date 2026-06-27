import fs from 'fs';
import path from 'path';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

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

        const users = await usersCollection.find({ email: 'superuves@gmail.com' }).toArray();
        console.log(`Found ${users.length} users matching superuves@gmail.com.`);

        for (const user of users) {
            console.log(`User: ${user.email} (${user._id})`);
            if (user.hashedPassword) {
                console.log(`  - Has hashed password: ${user.hashedPassword.substring(0, 7)}...`);
                // Check format
                if (!user.hashedPassword.startsWith('$2')) {
                    console.error('  - WARNING: Password hash format looks invalid!');
                }

                // Test specific users
                if (user.email === 'test@example.com') {
                    const match = await bcrypt.compare('password', user.hashedPassword);
                    console.log(`  - Compare 'password': ${match ? 'MATCH' : 'FAIL'}`);
                }
            } else {
                console.log('  - No hashed password set (OAuth only?)');
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

main();
