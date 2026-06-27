'use client';

import { CanvasEditor } from '@/components/canvas-editor';
import 'reactflow/dist/style.css';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppHeader } from '@/components/app-header';
import { useSession } from '@/lib/auth-client';
import { Sparkles } from 'lucide-react';
import { Button, Spinner } from '@/components/ui-kit';
import { openAgentLauncher } from '@/lib/agent/launcher';

interface Canvas {
  _id: string;
  userId: string;
  name: string;
  data: string;
  previewUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export default function CanvasPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: _session, status } = useSession();
  const { setHeaderInfo } = useAppHeader();

  const {
    data: canvasData,
    isLoading: isQueryLoading,
    error: queryError,
  } = useQuery<Canvas, Error>({
    queryKey: ['canvas', id],
    enabled: status === 'authenticated' && !!id,
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/v2/canvases/${id}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(response.status === 404 ? 'Canvas not found' : 'Failed to load canvas');
      }

      return response.json();
    },
  });

  const isLoading = status === 'authenticated' && !!id && isQueryLoading;
  const error = queryError ? queryError.message : null;

  useEffect(() => {
    if (canvasData) {
      setHeaderInfo({
        type: 'canvas',
        name: canvasData.name,
        actions: (
          <Button
            variant="outline"
            size="sm"
            icon={Sparkles}
            onClick={() => openAgentLauncher({
              prompt: 'Review this automation and turn it into a mission with optimization ideas, missing steps, failure risks, and next actions.',
              context: {
                source: 'canvas_editor',
                entityType: 'automation',
                entityId: canvasData._id,
                entityLabel: canvasData.name,
                route: `/canvas/${canvasData._id}`,
                notes: [
                  canvasData.updatedAt ? `Last updated: ${new Date(canvasData.updatedAt).toLocaleString()}` : '',
                  canvasData.previewUrl ? 'Preview available' : 'No preview captured yet',
                ].filter(Boolean),
              },
            })}
          >
            Ask Agent
          </Button>
        ),
      });
    }
    return () => setHeaderInfo(null);
  }, [canvasData, setHeaderInfo]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full sm:h-screen">
      <CanvasEditor
        canvasId={id}
        canvasName={canvasData?.name}
        canvasData={canvasData?.data}
        isCanvasLoading={isLoading}
      />
    </div>
  );
}
