/**
 * Set role for a user
 * Run: node scripts/set-user-role.mjs your-email@example.com super_admin
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/montrai';

const email = process.argv[2];
const role = process.argv[3];

const VALID_ROLES = ['user', 'admin', 'super_admin'];

if (!email || !role) {
    console.log('Usage: node scripts/set-user-role.mjs <email> <role>');
    console.log('Example: node scripts/set-user-role.mjs user@example.com super_admin');
    console.log(`Valid roles: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
}

if (!VALID_ROLES.includes(role)) {
    console.log(`❌ Invalid role: ${role}`);
    console.log(`Valid roles: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
}

async function setRole() {
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
        const users = await mongoose.connection.db.collection('users').find({}, { projection: { email: 1, role: 1 } }).toArray();
        users.forEach(u => console.log(`   - ${u.email} (${u.role || 'user'})`));
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log(`\nCurrent user details:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Current Role: ${user.role || 'user'}`);
    console.log(`   New Role: ${role}`);

    // Update user role
    await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        {
            $set: {
                role: role,
                updatedAt: new Date()
            }
        }
    );

    console.log(`\n✅ Role updated successfully!`);
    console.log(`   ${user.email} is now a ${role}`);

    await mongoose.disconnect();
}

setRole().catch(console.error);
