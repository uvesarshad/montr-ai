
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/mongodb';

console.log('Starting debug script...');

async function run() {
    try {
        await connectDB();
        console.log('Connected to DB');

        // Dynamic import to test resolution
        console.log('Importing Campaign Model...');
        const MarketingCampaign = (await import('../src/lib/db/models/marketing-email/campaign.model')).default;
        console.log('Campaign Model Imported');

        console.log('Importing Campaign Service...');
        const { campaignService } = await import('../src/lib/marketing-email/services/campaign.service');
        console.log('Campaign Service Imported');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
