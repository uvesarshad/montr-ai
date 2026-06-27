
'use client';

import { useRouter } from 'next/navigation';
import { PlusCircle } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './ui/tooltip';
import { useCanvases } from '@/hooks/use-canvases-v2';
import { useSession } from '@/lib/auth-client';
import { useToast } from '@/hooks/use-toast';
import { CANVAS_LIMIT_PER_USER } from '@/lib/config';

export function CreateCanvasButton({
  className,
  variant,
  size,
  iconClassName,
  ...props
}: ButtonProps & { iconClassName?: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { toast } = useToast();
  const { canvases, isLoading, createCanvas } = useCanvases();

  const atCanvasLimit = canvases ? canvases.length >= CANVAS_LIMIT_PER_USER : false;

  const handleCreateCanvas = async () => {
    if (!session) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to create a canvas.',
      });
      return;
    }

    if (atCanvasLimit) {
      toast({
        variant: 'destructive',
        title: 'Canvas Limit Reached',
        description: `You can only create up to ${CANVAS_LIMIT_PER_USER} canvases.`,
      });
      return;
    }

    try {
      const newCanvas = await createCanvas('Untitled Canvas', JSON.stringify({ nodes: [], edges: [] }));
      router.push(`/canvas/${newCanvas._id}`);
    } catch (error: unknown) {
      console.error('Error creating canvas: ', error);
      toast({
        variant: 'destructive',
        title: 'Error creating canvas',
        description: error instanceof Error ? error.message : 'Failed to create canvas',
      });
    }
  };

  const buttonContent = (
    <Button
      onClick={handleCreateCanvas}
      variant={variant || "primary-flare"}
      size={size}
      className={cn("gap-1.5 font-medium shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5", className)}
      disabled={isLoading || atCanvasLimit}
      {...props}
    >
      <PlusCircle className={iconClassName} />
      {size !== 'icon' && <span>New Automation</span>}
      {size === 'icon' && <span className="sr-only">New Automation</span>}
    </Button>
  );

  if (atCanvasLimit) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>{buttonContent}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Canvas limit of {CANVAS_LIMIT_PER_USER} reached.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return buttonContent;
}
