import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { connectDB } from '@/lib/mongodb';



import Canvas from '@/lib/db/models/canvas.model';
import DocumentModel from '@/lib/db/models/document.model';
import Brand from '@/lib/db/models/brand.model';
import FormModel from '@/lib/db/models/form.model';

type ResultType =
  | 'contact'
  | 'company'
  | 'deal'
  | 'activity'
  | 'canvas'
  | 'document'
  | 'brand'
  | 'form';

export interface GlobalSearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  updatedAt?: Date;
}

const ALL_TYPES: ResultType[] = [
  'contact',
  'company',
  'deal',
  'activity',
  'canvas',
  'document',
  'brand',
  'form',
];

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generic shape every search hit may have: `_id` is required, the rest are
 * the union of every projected field across the queries below. Optional + any
 * field types because each query .select()s a different subset.
 */
type SearchDoc = {
  _id: { toString(): string };
  updatedAt?: Date;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  name?: string;
  domain?: string;
  industry?: string;
  value?: number;
  currency?: string;
  status?: string;
  description?: string;
  subject?: string;
  type?: string;
  bodyPlain?: string;
  targetType?: string;
  handle?: string;
  title?: string;
  isPublished?: boolean;
};

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id! as string;
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const typesParam = searchParams.get('types');
    const limitParam = parseInt(searchParams.get('limit') || '5', 10);
    const limit = Math.min(Math.max(isNaN(limitParam) ? 5 : limitParam, 1), 10);

    if (q.length < 2) {
      return NextResponse.json({ results: [], grouped: {} });
    }

    const requestedTypes: ResultType[] = typesParam
      ? (typesParam.split(',') as ResultType[]).filter((t) =>
          ALL_TYPES.includes(t),
        )
      : ALL_TYPES;

    await connectDB();
    const regex = new RegExp(escapeRegex(q), 'i');

    const wants = (t: ResultType) => requestedTypes.includes(t);

    const tasks: Promise<GlobalSearchResult[]>[] = [];

    // CRM (organizationId required)
    // Canvas — has both userId and (sometimes) organizationId
    if (wants('canvas')) {
      const canvasFilter: Record<string, unknown> & { $or: Array<Record<string, unknown>> } = {
        name: regex,
        $or: [{ userId }],
      };
      tasks.push(
        Canvas.find(canvasFilter)
          .select('name updatedAt')
          .sort({ updatedAt: -1 })
          .limit(limit)
          .lean()
          .then((docs) =>
            (docs as SearchDoc[]).map((d) => ({
              type: 'canvas' as const,
              id: d._id.toString(),
              title: d.name || 'Untitled canvas',
              subtitle: 'Canvas',
              href: `/canvas/${d._id}`,
              updatedAt: d.updatedAt,
            })),
          ),
      );
    }

    // Brand — has both userId and (optional) organizationId
    if (wants('brand')) {
      const brandFilter: Record<string, unknown> & { $or: Array<Record<string, unknown>> } = {
        $or: [{ userId }],
        $and: [{ $or: [{ name: regex }, { handle: regex }] }],
      };
      tasks.push(
        Brand.find(brandFilter)
          .select('name handle updatedAt')
          .sort({ updatedAt: -1 })
          .limit(limit)
          .lean()
          .then((docs) =>
            (docs as SearchDoc[]).map((d) => ({
              type: 'brand' as const,
              id: d._id.toString(),
              title: d.name || 'Untitled brand',
              subtitle: d.handle ? `@${d.handle}` : undefined,
              href: `/settings?tab=brands`,
              updatedAt: d.updatedAt,
            })),
          ),
      );
    }

    // Documents — userId only
    if (wants('document')) {
      tasks.push(
        DocumentModel.find({ userId, title: regex })
          .select('title updatedAt')
          .sort({ updatedAt: -1 })
          .limit(limit)
          .lean()
          .then((docs) =>
            (docs as SearchDoc[]).map((d) => ({
              type: 'document' as const,
              id: d._id.toString(),
              title: d.title || 'Untitled note',
              subtitle: 'Note',
              href: `/docs/${d._id}`,
              updatedAt: d.updatedAt,
            })),
          ),
      );
    }

    // Forms — userId only
    if (wants('form')) {
      tasks.push(
        FormModel.find({ userId, title: regex })
          .select('title isPublished updatedAt')
          .sort({ updatedAt: -1 })
          .limit(limit)
          .lean()
          .then((docs) =>
            (docs as SearchDoc[]).map((d) => ({
              type: 'form' as const,
              id: d._id.toString(),
              title: d.title || 'Untitled form',
              subtitle: d.isPublished ? 'Published form' : 'Draft form',
              href: `/forms/${d._id}`,
              updatedAt: d.updatedAt,
            })),
          ),
      );
    }

    const settled = await Promise.allSettled(tasks);
    const results: GlobalSearchResult[] = settled.flatMap((r) =>
      r.status === 'fulfilled' ? r.value : [],
    );

    const grouped: Record<ResultType, GlobalSearchResult[]> = {
      contact: [],
      company: [],
      deal: [],
      activity: [],
      canvas: [],
      document: [],
      brand: [],
      form: [],
    };
    for (const r of results) grouped[r.type].push(r);

    return NextResponse.json({ results, grouped });
  } catch (error) {
    console.error('[search] failed', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
