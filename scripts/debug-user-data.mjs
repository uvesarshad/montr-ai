/**
 * Debug script to check user and canvas data
 * Run: node scripts/debug-user-data.mjs your-email@example.com
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/montrai';
const email = process.argv[2];

if (!email) {
    console.log('Usage: node scripts/debug-user-data.mjs <email>');
    process.exit(1);
}

async function debugUserData() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Find user
    console.log('=== USER DATA ===');
    const user = await db.collection('users').findOne({
        email: email.toLowerCase()
    });

    if (!user) {
        console.log(`❌ User not found: ${email}`);
        await mongoose.disconnect();
        return;
    }

    console.log('User found:');
    console.log('  _id:', user._id.toString());
    console.log('  email:', user.email);
    console.log('  name:', user.name);
    console.log('  firebaseUid:', user.firebaseUid || 'NOT SET');
    console.log('  role:', user.role);
    console.log('  hashedPassword:', user.hashedPassword ? 'SET' : 'NOT SET');

    // Find canvases by MongoDB _id
    console.log('\n=== CANVASES (by MongoDB _id) ===');
    const canvasesByMongoId = await db.collection('canvases').find({
        userId: user._id.toString()
    }).toArray();
    console.log(`Found ${canvasesByMongoId.length} canvases by MongoDB _id`);
    canvasesByMongoId.forEach(c => console.log(`  - ${c.name} (userId: ${c.userId})`));

    // Find canvases by firebaseUid
    if (user.firebaseUid) {
        console.log('\n=== CANVASES (by Firebase UID) ===');
        const canvasesByFirebaseUid = await db.collection('canvases').find({
            userId: user.firebaseUid
        }).toArray();
        console.log(`Found ${canvasesByFirebaseUid.length} canvases by Firebase UID`);
        canvasesByFirebaseUid.forEach(c => console.log(`  - ${c.name} (userId: ${c.userId})`));
    }

    // Show all canvases and their userIds
    console.log('\n=== ALL CANVASES IN DATABASE ===');
    const allCanvases = await db.collection('canvases').find({}).toArray();
    console.log(`Total canvases: ${allCanvases.length}`);
    allCanvases.forEach(c => console.log(`  - ${c.name} | userId: ${c.userId}`));

    // Show all documents
    console.log('\n=== ALL DOCUMENTS IN DATABASE ===');
    const allDocs = await db.collection('documents').find({}).toArray();
    console.log(`Total documents: ${allDocs.length}`);
    allDocs.forEach(d => console.log(`  - ${d.title || 'Untitled'} | userId: ${d.userId}`));

    await mongoose.disconnect();
    console.log('\n✅ Done!');
}

debugUserData().catch(console.error);
