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
                const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes if any
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
        console.log('.env.local loaded');
    } else {
        console.log('.env.local not found');
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
        // Assuming DB name is in URI or 'montrai'
        const dbName = process.env.MONGODB_DB_NAME || 'montrai';
        const db = client.db(dbName);

        // Find the user
        const usersCollection = db.collection('users');
        let user = await usersCollection.findOne({ email: 'test@example.com' });

        let orgId;

        if (!user) {
            console.log('User test@example.com not found. Creating user...');

            // Create Org first
            const orgsCollection = db.collection('organizations');
            const org = await orgsCollection.findOne({ name: 'Test Org' });
            if (org) {
                orgId = org._id;
            } else {
                const newOrg = await orgsCollection.insertOne({
                    name: 'Test Org',
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                orgId = newOrg.insertedId;
                console.log('Created Test Org:', orgId);
            }

            const hashedPassword = await bcrypt.hash('password', 10);
            const newUser = await usersCollection.insertOne({
                email: 'test@example.com',
                name: 'Test User',
                hashedPassword,
                emailVerified: new Date(),
                role: 'admin',
                organizationId: orgId,
                createdAt: new Date(),
                updatedAt: new Date(),
                twoFactorEnabled: false
            });
            user = await usersCollection.findOne({ _id: newUser.insertedId });
            console.log('User created:', user?._id);
        } else {
            console.log('Found user:', user._id);
            orgId = user.organizationId;

            // If orgId is missing, set it
            if (!orgId) {
                const orgsCollection = db.collection('organizations');
                const org = await orgsCollection.findOne({ name: 'Test Org' });
                if (org) {
                    orgId = org._id;
                } else {
                    const newOrg = await orgsCollection.insertOne({
                        name: 'Test Org',
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });
                    orgId = newOrg.insertedId;
                }
            }
        }

        // Always update user to ensure rights
        let hashedPassword = user?.hashedPassword;
        if (!hashedPassword) {
            hashedPassword = await bcrypt.hash('password', 10);
        }

        await usersCollection.updateOne(
            { _id: user?._id },
            {
                $set: {
                    emailVerified: new Date(),
                    role: 'admin',
                    organizationId: orgId,
                    hashedPassword: hashedPassword
                }
            }
        );

        console.log('User updated: Verified, Admin, OrgId set.');
        console.log('Now you can login with test@example.com / password and check /admin/audit-logs');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

main();
