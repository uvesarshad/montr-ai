import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import FormModel from '@/lib/db/models/form.model';
import FormSubmissionModel from '@/lib/db/models/form-submission.model';
import { startOfDay, subDays, format } from 'date-fns';
import { Types } from 'mongoose';

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        const formId = params.id;

        // Verify form ownership and get form content (for field definitions)
        const form = await FormModel.findById(formId);
        if (!form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }
        if (form.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 1. Total Submissions
        const totalSubmissions = await FormSubmissionModel.countDocuments({ formId });

        // 2. Submissions Over Time (Last 30 days)
        const thirtyDaysAgo = subDays(startOfDay(new Date()), 30);

        // Use aggregation to group by day
        // Note: MongoDB dates are stored in UTC. Ideally we'd use timezone adjustment but keeping it simple for now.
        const submissionsTrend = await FormSubmissionModel.aggregate([
            {
                $match: {
                    formId: new Types.ObjectId(formId),
                    createdAt: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Fill in missing dates for the trend
        // Create a map for O(1) lookup
        const trendMap = new Map();
        submissionsTrend.forEach(item => {
            trendMap.set(item._id, item.count);
        });

        const filledTrend = [];
        for (let i = 30; i >= 0; i--) {
            const date = subDays(new Date(), i);
            const dateStr = format(date, 'yyyy-MM-dd');
            filledTrend.push({
                date: dateStr,
                count: trendMap.get(dateStr) || 0
            });
        }

        // 2b. Week-over-week comparison
        const thisWeekStart = subDays(startOfDay(new Date()), 6);
        const lastWeekStart = subDays(thisWeekStart, 7);
        const lastWeekEnd = subDays(thisWeekStart, 1);

        const [thisWeekCount, lastWeekCount] = await Promise.all([
            FormSubmissionModel.countDocuments({ formId, createdAt: { $gte: thisWeekStart } }),
            FormSubmissionModel.countDocuments({ formId, createdAt: { $gte: lastWeekStart, $lte: lastWeekEnd } }),
        ]);

        const weekOverWeekChange = lastWeekCount > 0
            ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
            : null;

        // 3. Field Analytics
        // Parse form content to identify fields
        let formContent;
        try {
            formContent = typeof form.content === 'string' ? JSON.parse(form.content) : form.content;
        } catch (_e) {
            formContent = { content: [] };
        }

        const fields: Array<{ id: string; type: string; label: string; options: string[] }> = [];
        // Traverse content to find fields. Assuming Tiptap JSON structure where fields are top-level or slightly nested.
        // Tiptap content is { type: 'doc', content: [...] }
        if (formContent?.content && Array.isArray(formContent.content)) {
            for (const node of formContent.content) {
                // Check if node is a form field (based on node.type typically starting with 'form')
                if (node.type && node.type.startsWith('form') && node.attrs?.id) {
                    fields.push({
                        id: node.attrs.id,
                        type: node.type,
                        label: node.attrs.label || 'Untitled Field',
                        options: node.attrs.options || [] // for select/checkbox/radio
                    });
                }
            }
        }

        const fieldAnalytics = [];

        // 3b. Average field completion rate
        // Calculated from a sample: avg % of defined fields that were non-empty per submission
        let avgFieldCompletionRate: number | null = null;

        if (fields.length > 0) {
            // Fetch recent 100 submissions to analyze distribution
            // We use lean() for performance
            const recentSubmissions = await FormSubmissionModel.find({ formId })
                .sort({ createdAt: -1 })
                .limit(100)
                .select('data')
                .lean();

            for (const field of fields) {
                const fieldId = field.id;
                // Extract answers for this field
                const answers = recentSubmissions
                    .map(sub => sub.data?.[fieldId])
                    .filter(val => val !== undefined && val !== null && val !== '');

                const stats: Record<string, unknown> = {
                    totalResponses: answers.length,
                    responseRate: totalSubmissions > 0 ? Math.round((answers.length / totalSubmissions) * 100) : 0,
                    type: field.type
                };

                // Analyze based on type
                if (['formMultipleChoice', 'formDropdown', 'formCheckbox'].includes(field.type)) {
                    // Count frequency of each option
                    const counts: Record<string, number> = {};
                    answers.forEach(ans => {
                        if (Array.isArray(ans)) {
                            ans.forEach(a => {
                                const key = String(a);
                                counts[key] = (counts[key] || 0) + 1;
                            });
                        } else {
                            const key = String(ans);
                            counts[key] = (counts[key] || 0) + 1;
                        }
                    });

                    stats.distribution = Object.entries(counts)
                        .map(([name, value]) => ({ name, value }))
                        .sort((a, b) => b.value - a.value); // Sort by frequency desc
                } else if (field.type === 'formRating') {
                    // Calculate average
                    const numericAnswers = answers.map(a => Number(a)).filter(n => !isNaN(n));
                    if (numericAnswers.length > 0) {
                        const sum = numericAnswers.reduce((a, b) => a + b, 0);
                        stats.average = (sum / numericAnswers.length).toFixed(1);

                        // Also distribution
                        const counts: Record<string, number> = {};
                        numericAnswers.forEach(n => {
                            counts[n] = (counts[n] || 0) + 1;
                        });
                        stats.distribution = Object.entries(counts)
                            .map(([name, value]) => ({ name, value }))
                            .sort((a, b) => Number(a.name) - Number(b.name)); // Sort by rating value asc
                    } else {
                        stats.average = 0;
                        stats.distribution = [];
                    }
                } else {
                    // Text fields — show top frequent answers and recent examples
                    const freqMap = new Map<string, number>();
                    answers.forEach(ans => {
                        const key = String(ans).trim();
                        if (key) freqMap.set(key, (freqMap.get(key) || 0) + 1);
                    });
                    const topAnswers = [...freqMap.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([value, count]) => ({ value, count }));

                    const totalChars = answers.reduce<number>((sum, ans) => sum + String(ans).length, 0);
                    stats.avgResponseLength = answers.length > 0 ? Math.round(totalChars / answers.length) : 0;
                    stats.topAnswers = topAnswers;
                    stats.recentValues = answers.slice(0, 5).map(a => String(a));
                }

                fieldAnalytics.push({
                    ...field,
                    stats
                });
            }

            // Compute average field completion rate from the sample
            if (recentSubmissions.length > 0) {
                const totalFilled = recentSubmissions.reduce((sum, sub) => {
                    const filled = fields.filter(f => {
                        const val = sub.data?.[f.id];
                        return val !== undefined && val !== null && val !== '';
                    }).length;
                    return sum + filled;
                }, 0);
                avgFieldCompletionRate = Math.round((totalFilled / (recentSubmissions.length * fields.length)) * 100);
            }
        }

        return NextResponse.json({
            totalSubmissions,
            thisWeekCount,
            lastWeekCount,
            weekOverWeekChange,
            avgFieldCompletionRate,
            submissionsTrend: filledTrend,
            fieldAnalytics
        });

    } catch (error) {
        console.error('Error fetching form analytics:', error);
        return NextResponse.json(
            { error: 'Failed to fetch analytics' },
            { status: 500 }
        );
    }
}
