
import dotenv from 'dotenv';
dotenv.config();

// Force URI if not set
if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/montrai';
}

// @ts-ignore
import { dbConnect } from '../src/lib/db/connect';
// @ts-ignore
import CreditUsage from '../src/lib/db/models/credit-usage.model';
import mongoose from 'mongoose';

async function debugState() {
    try {
        console.log('Connecting to DB...', process.env.MONGODB_URI);
        await dbConnect();

        const db = mongoose.connection.db;
        if (!db) throw new Error('No DB connection');

        // @ts-ignore
        const users = await db.collection('users').find({}).toArray();
        console.log(`Found ${users.length} users.`);

        for (const user of users) {
            console.log(`\nUser: ${user.email} (${user._id})`);
            // @ts-ignore
            const usage = await CreditUsage.findOne({ userId: user._id.toString() });

            if (usage) {
                console.log('  Credit Usage Record Found:');
                console.log('  - Period:', usage.periodStart, 'to', usage.periodEnd);
                // @ts-ignore
                console.log('  - Allocated:', usage.creditsAllocated);
                // @ts-ignore
                console.log('  - Used:', usage.creditsUsed);

                const now = new Date();
                // @ts-ignore
                const isActive = now >= usage.periodStart && now <= usage.periodEnd;
                console.log('  - Is Active Period?', isActive ? 'YES' : 'NO (Expired or Future)');
            } else {
                console.log('  NO Credit Usage Record Found.');
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Debug script failed:', error);
        process.exit(1);
    }
}

debugState();
