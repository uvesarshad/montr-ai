/**
 * Create a test user in MongoDB
 * Run: node scripts/create-test-user.mjs
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/montrai';

async function createTestUser() {
    console.log('🔌 Connecting to MongoDB...');

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if user already exists
    const existingUser = await mongoose.connection.db.collection('users').findOne({
        email: 'test@test.com'
    });

    if (existingUser) {
        console.log('⏭️  Test user already exists');
        console.log('   Email: test@test.com');
        console.log('   Password: password123');
    } else {
        // Hash password
        const hashedPassword = await bcrypt.hash('password123', 12);

        // Create test user
        const result = await mongoose.connection.db.collection('users').insertOne({
            email: 'test@test.com',
            name: 'Test User',
            hashedPassword: hashedPassword,
            role: 'user',
            emailVerified: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        console.log('✅ Test user created!');
        console.log('   ID:', result.insertedId);
        console.log('   Email: test@test.com');
        console.log('   Password: password123');
    }

    await mongoose.disconnect();
    console.log('\n🎉 Done! You can now sign in at /auth/signin');
}

createTestUser().catch(console.error);
