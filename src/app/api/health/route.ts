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
        // Cross-platform disk usage via fs.statfs (no shell-out; works on Linux,
        // macOS, and Windows). The old `df -h /` always threw on Windows, which
        // marked the whole app unhealthy (503) on any Windows dev box.
        const root = process.platform === 'win32' ? process.cwd().split(/[\\/]/)[0] + '\\' : '/';
        const stat = fs.statfsSync(root);
        const total = stat.blocks * stat.bsize;
        const free = stat.bavail * stat.bsize;
        const used = total - free;
        const fmtGb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)}G`;
        const percentUsed = total > 0 ? Math.round((used / total) * 100) : 0;

        diskUsage = {
            total: fmtGb(total),
            used: fmtGb(used),
            free: fmtGb(free),
            percentUsed,
        };

        // High disk usage flows through the existing `degraded` path below
        // (overall status, not a 503): a full-but-readable disk should not pull
        // the container out of load-balancer rotation. `down` is reserved for a
        // genuinely inaccessible filesystem (the catch).
    } catch (error) {
        // Can't even stat the filesystem — that's a real liveness problem.
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
