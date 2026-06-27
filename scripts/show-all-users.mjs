/**
 * Show all users and their data in MongoDB
 * Run: node scripts/show-all-users.mjs
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/montrai';

async function showAllData() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Show all users
    console.log('=== ALL USERS ===');
    const users = await db.collection('users').find({}).toArray();
    console.log(`Total users: ${users.length}\n`);

    for (const user of users) {
        console.log(`User: ${user.email}`);
        console.log(`  _id: ${user._id}`);
        console.log(`  firebaseUid: ${user.firebaseUid || 'NOT SET'}`);

        // Count their canvases
        const canvasCount = await db.collection('canvases').countDocuments({
            userId: user._id.toString()
        });
        const canvasCountByFbUid = user.firebaseUid
            ? await db.collection('canvases').countDocuments({ userId: user.firebaseUid })
            : 0;

        console.log(`  Canvases by _id: ${canvasCount}`);
        console.log(`  Canvases by firebaseUid: ${canvasCountByFbUid}`);
        console.log('');
    }

    // Show orphaned canvases (userId doesn't match any user)
    console.log('\n=== ORPHANED CANVASES ===');
    const allCanvases = await db.collection('canvases').find({}).toArray();

    const userIds = new Set(users.map(u => u._id.toString()));
    const firebaseUids = new Set(users.filter(u => u.firebaseUid).map(u => u.firebaseUid));

    const orphaned = allCanvases.filter(c =>
        !userIds.has(c.userId) && !firebaseUids.has(c.userId)
    );

    console.log(`Orphaned canvases: ${orphaned.length}`);
    orphaned.forEach(c => console.log(`  - ${c.name} (userId: ${c.userId})`));

    await mongoose.disconnect();
    console.log('\n✅ Done!');
}

showAllData().catch(console.error);
