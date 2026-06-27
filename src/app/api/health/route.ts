import { NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/mongodb';
import fs from 'fs';
import os from 'os';

export const dynamic = 'force-dynamic';

interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    services: {
        mongodb: {
            status: 'up' | 'down';
            responseTime?: number;
        };
        filesystem: {
            status: 'up' | 'down';
            diskUsage?: {
                total: string;
                used: string;
                free: string;
                percentUsed: number;
            };
        };
    };
    system: {
        memory: {
            total: string;
            used: string;
            free: string;
            percentUsed: number;
        };
        cpu: {
            cores: number;
            loadAverage: number[];
        };
    };
    lastBackup?: {
        timestamp: string;
        status: 'success' | 'failed' | 'unknown';
    };
}

/**
 * Health check endpoint for monitoring
 * GET /api/health
 */
export async function GET() {
    const startTime = Date.now();

    // Check MongoDB connection
    let mongoStatus: 'up' | 'down' = 'down';
    let mongoResponseTime: number | undefined;

    try {
        const mongoStart = Date.now();
        const client = await getMongoClient();
        await client.db('admin').command({ ping: 1 });
        mongoResponseTime = Date.now() - mongoStart;
        mongoStatus = 'up';
    } catch (error) {
        console.error('MongoDB health check failed:', error);
    }

    // Check filesystem
    let filesystemStatus: 'up' | 'down' = 'up';
    let diskUsage: HealthStatus['services']['filesystem']['diskUsage'];

    try {
        // Get disk usage for root partition
        const { execSync } = await import('child_process');
        const dfOutput = execSync('df -h / | tail -1').toString();
        const parts = dfOutput.split(/\s+/);

        diskUsage = {
            total: parts[1],
            used: parts[2],
            free: parts[3],
            percentUsed: parseInt(parts[4].replace('%', ''))
        };

        // Mark as degraded if disk usage > 80%
        if (diskUsage.percentUsed > 80) {
            filesystemStatus = 'down';
        }
    } catch (error) {
        console.error('Filesystem check failed:', error);
        filesystemStatus = 'down';
    }

    // Get system information
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const memory = {
        total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        used: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        free: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        percentUsed: Math.round((usedMem / totalMem) * 100)
    };

    const cpu = {
        cores: os.cpus().length,
        loadAverage: os.loadavg()
    };

    // Check last backup status
    let lastBackup: HealthStatus['lastBackup'];
    try {
        const logPath = '/var/log/mongodb-backup.log';
        if (fs.existsSync(logPath)) {
            const logContent = fs.readFileSync(logPath, 'utf-8');
            const lines = logContent.trim().split('\n');
            const lastLine = lines[lines.length - 1];

            if (lastLine.includes('completed successfully')) {
                const timestampMatch = lastLine.match(/\[(.*?)\]/);
                lastBackup = {
                    timestamp: timestampMatch ? timestampMatch[1] : 'unknown',
                    status: 'success'
                };
            } else if (lastLine.includes('ERROR')) {
                lastBackup = {
                    timestamp: new Date().toISOString(),
                    status: 'failed'
                };
            }
        }
    } catch (_error) {
        // Backup log not accessible
    }

    // Determine overall health status
    let overallStatus: HealthStatus['status'] = 'healthy';

    if (mongoStatus === 'down' || filesystemStatus === 'down') {
        overallStatus = 'unhealthy';
    } else if (memory.percentUsed > 80 || (diskUsage && diskUsage.percentUsed > 80)) {
        overallStatus = 'degraded';
    }

    const response: HealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
            mongodb: {
                status: mongoStatus,
                responseTime: mongoResponseTime
            },
            filesystem: {
                status: filesystemStatus,
                diskUsage
            }
        },
        system: {
            memory,
            cpu
        },
        lastBackup
    };

    const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

    return NextResponse.json(response, {
        status: statusCode,
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Response-Time': `${Date.now() - startTime}ms`
        }
    });
}
