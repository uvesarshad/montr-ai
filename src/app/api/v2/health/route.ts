import { NextResponse } from 'next/server';
import { getDatabase, checkMongoConnection } from '@/lib/mongodb';

/**
 * GET /api/v2/health
 * Health check that verifies MongoDB connection
 * This endpoint doesn't require authentication - useful for testing
 */
export async function GET() {
    try {
        const mongoConnected = await checkMongoConnection();

        let canvasCount = 0;
        let userCount = 0;

        if (mongoConnected) {
            const db = await getDatabase();
            canvasCount = await db.collection('canvases').countDocuments();
            userCount = await db.collection('users').countDocuments();
        }

        return NextResponse.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            services: {
                mongodb: mongoConnected ? 'connected' : 'disconnected',
            },
            stats: {
                users: userCount,
                canvases: canvasCount,
            },
            message: mongoConnected
                ? '🎉 MongoDB is working! Your infrastructure is ready.'
                : '❌ MongoDB connection failed. Check your connection string.',
        });
    } catch (error) {
        console.error('Health check error:', error);
        return NextResponse.json({
            status: 'error',
            timestamp: new Date().toISOString(),
            services: {
                mongodb: 'error',
            },
            error: String(error),
        }, { status: 503 });
    }
}
