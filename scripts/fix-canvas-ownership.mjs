/**
 * Fix canvas ownership by updating userId to match the user's MongoDB _id
 * Run: node scripts/fix-canvas-ownership.mjs your-email@example.com
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/montrai';
const email = process.argv[2];

if (!email) {
    console.log('Usage: node scripts/fix-canvas-ownership.mjs <email>');
    process.exit(1);
}

async function fixCanvasOwnership() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Find user
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
    console.log('  firebaseUid:', user.firebaseUid || 'NOT SET');

    const userMongoId = user._id.toString();
    const firebaseUid = user.firebaseUid;

    // Find all canvases that could belong to this user
    console.log('\n=== FINDING CANVASES TO FIX ===');

    // First, find all unique userIds in canvases
    const allCanvases = await db.collection('canvases').find({}).toArray();
    console.log(`Total canvases in database: ${allCanvases.length}`);

    let fixedCount = 0;

    // Fix canvases that have firebaseUid as userId
    if (firebaseUid) {
        const result1 = await db.collection('canvases').updateMany(
            { userId: firebaseUid },
            { $set: { userId: userMongoId } }
        );
        console.log(`Fixed ${result1.modifiedCount} canvases with firebaseUid`);
        fixedCount += result1.modifiedCount;
    }

    // Also fix documents
    console.log('\n=== FINDING DOCUMENTS TO FIX ===');
    const allDocs = await db.collection('documents').find({}).toArray();
    console.log(`Total documents in database: ${allDocs.length}`);

    if (firebaseUid) {
        const result2 = await db.collection('documents').updateMany(
            { userId: firebaseUid },
            { $set: { userId: userMongoId } }
        );
        console.log(`Fixed ${result2.modifiedCount} documents with firebaseUid`);
        fixedCount += result2.modifiedCount;
    }

    // Now verify
    console.log('\n=== VERIFICATION ===');
    const myCanvases = await db.collection('canvases').find({ userId: userMongoId }).toArray();
    console.log(`Canvases for user: ${myCanvases.length}`);
    myCanvases.forEach(c => console.log(`  - ${c.name}`));

    const myDocs = await db.collection('documents').find({ userId: userMongoId }).toArray();
    console.log(`Documents for user: ${myDocs.length}`);
    myDocs.forEach(d => console.log(`  - ${d.title || 'Untitled'}`));

    await mongoose.disconnect();
    console.log(`\n✅ Fixed ${fixedCount} items!`);
}

fixCanvasOwnership().catch(console.error);
