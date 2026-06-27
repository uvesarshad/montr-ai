import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/montrai';
const DB_NAME = MONGODB_URI.split('/').pop()?.split('?')[0] || 'montrai';

async function verifyBulkOps() {
    console.log('🚀 Starting Bulk Operations Verification...');

    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const db = client.db(DB_NAME);

        // 1. Create dummy users for testing
        const testUsers = [
            { email: 'bulk1@test.com', name: 'Bulk One', role: 'user', createdAt: new Date() },
            { email: 'bulk2@test.com', name: 'Bulk Two', role: 'user', createdAt: new Date() },
            { email: 'bulk3@test.com', name: 'Bulk Three', role: 'user', createdAt: new Date() },
        ];

        console.log('📝 Creating test users...');
        const insertResult = await db.collection('users').insertMany(testUsers);
        const userIds = Object.values(insertResult.insertedIds).map(id => id.toString());
        console.log(`✅ Created ${userIds.length} test users:`, userIds);

        // 2. Test Bulk Role Update
        console.log('🔄 Testing Bulk Role Update...');
        const updateRoleResult = await db.collection('users').updateMany(
            { _id: { $in: userIds.map(id => new ObjectId(id)) } },
            { $set: { role: 'admin', updatedAt: new Date() } }
        );
        console.log('✅ Update result:', updateRoleResult.modifiedCount);

        const updatedUsers = await db.collection('users').find({ _id: { $in: userIds.map(id => new ObjectId(id)) } }).toArray();
        const allAdmins = updatedUsers.every(u => u.role === 'admin');
        console.log(allAdmins ? '✅ All users are now admins' : '❌ Role update failed');

        // 3. Test Bulk Plan Update
        console.log('🔄 Testing Bulk Plan Update...');
        const testPlanId = new ObjectId().toString();
        await db.collection('users').updateMany(
            { _id: { $in: userIds.map(id => new ObjectId(id)) } },
            { $set: { planId: testPlanId, updatedAt: new Date() } }
        );
        const planUsers = await db.collection('users').find({ _id: { $in: userIds.map(id => new ObjectId(id)) } }).toArray();
        const allHasPlan = planUsers.every(u => (u as any).planId === testPlanId);
        console.log(allHasPlan ? '✅ All users have the test plan' : '❌ Plan update failed');

        // 4. Test Bulk Delete
        console.log('🗑️ Testing Bulk Delete...');
        const deleteResult = await db.collection('users').deleteMany({ _id: { $in: userIds.map(id => new ObjectId(id)) } });
        console.log('✅ Delete result:', deleteResult.deletedCount);

        const remainingUsers = await db.collection('users').countDocuments({ _id: { $in: userIds.map(id => new ObjectId(id)) } });
        console.log(remainingUsers === 0 ? '✅ All test users deleted' : '❌ Delete failed');

        console.log('\n✨ Verification Complete!');
    } finally {
        await client.close();
    }
}

verifyBulkOps().catch(console.error);
