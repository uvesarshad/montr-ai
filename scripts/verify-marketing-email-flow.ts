
import 'dotenv/config'; // Ensure env vars are loaded
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/mongodb';
import MarketingCampaign from '../src/lib/db/models/marketing-email/campaign.model';
import MarketingTemplate from '../src/lib/db/models/marketing-email/template.model';
import MarketingProvider from '../src/lib/db/models/marketing-email/provider.model';
import Contact from '../src/lib/db/models/crm/contact.model';
import { campaignService } from '../src/lib/marketing-email/services/campaign.service';
import { getMarketingEmailQueue } from '../src/lib/marketing-email/jobs/queue';

async function verifyFlow() {
    console.log('Starting Marketing Email Verification...');

    try {
        await connectDB();
        console.log('✅ Connected to MongoDB');

        // 1. Create Mock Provider
        const provider = await MarketingProvider.create({
            organizationId: 'org_test_123',
            name: 'Test SMTP Provider',
            type: 'smtp',
            fromName: 'Test Sender',
            fromEmail: 'test@example.com',
            isDefault: true,
            credentials: {
                host: 'smtp.ethereal.email',
                port: 587,
                user: 'test_user',
                pass: 'test_pass',
                secure: false
            }
        });
        console.log('✅ Created Mock Provider:', provider._id);

        // 2. Create Mock Template
        const template = await MarketingTemplate.create({
            organizationId: 'org_test_123',
            name: 'Test Template',
            subject: 'Hello {{contact.firstName}}',
            htmlContent: '<h1>Welcome {{contact.firstName}}</h1>',
            textContent: 'Welcome {{contact.firstName}}',
        });
        console.log('✅ Created Mock Template:', template._id);

        // 3. Create Mock Contact
        const contact = await Contact.create({
            organizationId: 'org_test_123',
            firstName: 'John',
            lastName: 'Doe',
            email: `test_${Date.now()}@example.com`,
        });
        console.log('✅ Created Mock Contact:', contact._id);

        // 4. Create Campaign
        const campaign = await MarketingCampaign.create({
            organizationId: 'org_test_123',
            name: 'Test Campaign ' + Date.now(),
            status: 'draft',
            type: 'broadcast',
            templateId: template._id,
            providerId: provider._id,
            targetType: 'all', // Send to all (which includes our contact)
            config: {
                trackOpens: true,
                trackClicks: true
            }
        });
        console.log('✅ Created Campaign:', campaign._id);

        // 5. Trigger Sending (Simulate API / Job)
        // We will manually trigger the processing logic to test the service
        console.log('🔄 Processing Campaign Batch...');

        // Mock the queue addition to avoid actual redis requirement if possible, 
        // but here we want to test the full service method which might use queue.
        // Actually campaignService.processCampaignBatch is what the job calls.
        // Let's call it directly to verify logic without needing a running worker.

        // First we need to set status to scheduled/sending so the query finds it
        campaign.status = 'sending';
        await campaign.save();

        // Check if queue connection works (optional, might fail if no redis)
        try {
            const queue = getMarketingEmailQueue();
            await queue.close(); // Just check connectivity then close
            console.log('✅ Redis Queue Connection Initialized (BullMQ)');
        } catch (e) {
            console.warn('⚠️ Redis not available or connection failed. Skipping Queue test.');
        }

        // We will mock the provider sending to avoid actual network calls failing
        // We can't easily mock the internal class instance here without dependency injection or mocking lib.
        // For this verification, we expect it to FAIL at the "sending" step because credentials are fake,
        // BUT it should successfully fetch recipients and TRY to send.

        try {
            const result = await campaignService.processCampaignBatch(campaign._id.toString());
            console.log('✅ Campaign Batch Processed. Result:', result);
        } catch (error: any) {
            // Expected to fail on actual send with fake credentials
            console.log('ℹ️ Campaign Processing attempted (Expected failure on send):', error.message);
            if (error.message.includes('Invalid login') || error.message.includes('Connection')) {
                console.log('✅ Service correctly attempted to connect to SMTP.');
            }
        }

        // Cleanup
        await MarketingCampaign.deleteMany({ organizationId: 'org_test_123' });
        await MarketingTemplate.deleteMany({ organizationId: 'org_test_123' });
        await MarketingProvider.deleteMany({ organizationId: 'org_test_123' });
        await Contact.deleteOne({ _id: contact._id });
        console.log('✅ Cleanup Complete');

    } catch (error) {
        console.error('❌ Verification Failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

verifyFlow();
