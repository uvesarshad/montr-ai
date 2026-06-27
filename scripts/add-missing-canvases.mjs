/**
 * Add missing canvas data manually
 * 
 * Usage: 
 * 1. Copy the canvas data from Firebase Console
 * 2. Edit the canvasesToAdd array below
 * 3. Run: node scripts/add-missing-canvases.mjs
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/montrai';

// ============= EDIT THIS SECTION =============
// The email of the user who owns these canvases
const userEmail = 'superuves@gmail.com';

// Add the canvas data from Firebase Console here
// You can find this in: Firestore Database -> Data -> users -> [userId] -> canvases
const canvasesToAdd = [
    // Example:
    // {
    //   name: 'My Canvas Name',
    //   data: '{"nodes":[],"edges":[]}', // Copy the data field from Firebase
    //   createdAt: '2024-01-01T00:00:00Z',
    //   updatedAt: '2024-01-01T00:00:00Z',
    // },
];

// Documents to add (if any)
const documentsToAdd = [
    // Example:
    // {
    //   title: 'My Document',
    //   content: '<p>Document content...</p>',
    //   isPublished: false,
    //   createdAt: '2024-01-01T00:00:00Z',
    //   updatedAt: '2024-01-01T00:00:00Z',
    // },
];
// ===============================================

async function addMissingData() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Find user
    const user = await db.collection('users').findOne({
        email: userEmail.toLowerCase()
    });

    if (!user) {
        console.log(`❌ User not found: ${userEmail}`);
        await mongoose.disconnect();
        return;
    }

    console.log(`Found user: ${user.email} (${user._id})\n`);

    // Add canvases
    if (canvasesToAdd.length > 0) {
        console.log(`📦 Adding ${canvasesToAdd.length} canvases...`);

        for (const canvas of canvasesToAdd) {
            try {
                await db.collection('canvases').insertOne({
                    userId: user._id.toString(),
                    name: canvas.name || 'Untitled Canvas',
                    data: canvas.data || JSON.stringify({ nodes: [], edges: [] }),
                    previewUrl: canvas.previewUrl,
                    createdAt: canvas.createdAt ? new Date(canvas.createdAt) : new Date(),
                    updatedAt: canvas.updatedAt ? new Date(canvas.updatedAt) : new Date(),
                });
                console.log(`  ✅ Added canvas: ${canvas.name}`);
            } catch (error) {
                console.error(`  ❌ Failed to add canvas: ${canvas.name}`, error.message);
            }
        }
    }

    // Add documents
    if (documentsToAdd.length > 0) {
        console.log(`\n📦 Adding ${documentsToAdd.length} documents...`);

        for (const doc of documentsToAdd) {
            try {
                await db.collection('documents').insertOne({
                    userId: user._id.toString(),
                    title: doc.title || 'Untitled Document',
                    content: doc.content || '',
                    isPublished: doc.isPublished || false,
                    publishedUrl: doc.publishedUrl,
                    createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
                    updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
                });
                console.log(`  ✅ Added document: ${doc.title}`);
            } catch (error) {
                console.error(`  ❌ Failed to add document: ${doc.title}`, error.message);
            }
        }
    }

    await mongoose.disconnect();
    console.log('\n✅ Done!');
}

addMissingData().catch(console.error);
