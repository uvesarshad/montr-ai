/**
 * Set password for a migrated Firebase user
 * Run: node scripts/set-user-password.mjs your-email@example.com "your-new-password"
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/montrai';

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
    console.log('Usage: node scripts/set-user-password.mjs <email> <password>');
    console.log('Example: node scripts/set-user-password.mjs user@example.com mypassword123');
    process.exit(1);
}

async function setPassword() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find user
    const user = await mongoose.connection.db.collection('users').findOne({
        email: email.toLowerCase()
    });

    if (!user) {
        console.log(`❌ User not found: ${email}`);
        console.log('\nAvailable users:');
        const users = await mongoose.connection.db.collection('users').find({}, { projection: { email: 1 } }).toArray();
        users.forEach(u => console.log(`   - ${u.email}`));
        await mongoose.disconnect();
        process.exit(1);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user
    await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        {
            $set: {
                hashedPassword: hashedPassword,
                updatedAt: new Date()
            }
        }
    );

    console.log(`✅ Password updated for: ${email}`);
    console.log('\n🎉 You can now sign in with:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);

    await mongoose.disconnect();
}

setPassword().catch(console.error);
