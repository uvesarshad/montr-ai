'use client';

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FavoriteTargetType } from '@/types/crm';
import { useToast } from '@/hooks/use-toast';

interface FavoriteButtonProps {
  targetType: FavoriteTargetType;
  targetId: string;
  initialIsFavorite?: boolean;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'ghost';
  showTooltip?: boolean;
  onToggle?: (isFavorite: boolean) => void;
}

export function FavoriteButton({
  targetType,
  targetId,
  initialIsFavorite = false,
  size = 'default',
  variant = 'ghost',
  showTooltip = true,
  onToggle,
}: FavoriteButtonProps) {
  const { toast } = useToast();
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setIsFavorite(initialIsFavorite);
  }, [initialIsFavorite]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isLoading) return;

    // Optimistic update
    const newIsFavorite = !isFavorite;
    setIsFavorite(newIsFavorite);
    setIsAnimating(true);

    setTimeout(() => setIsAnimating(false), 300);

    try {
      setIsLoading(true);

      if (newIsFavorite) {
        // Add to favorites
        const response = await fetch('/api/v2/crm/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ targetType, targetId }),
        });

        if (!response.ok) {
          throw new Error('Failed to add favorite');
        }
      } else {
        // Remove from favorites - first find the favorite ID
        const listResponse = await fetch(
          `/api/v2/crm/favorites?targetType=${targetType}`,
          {
            credentials: 'include',
          }
        );

        if (!listResponse.ok) {
          throw new Error('Failed to fetch favorites');
        }

        const favorites = await listResponse.json();
        const favorite = (favorites.data || favorites).find(
          (f: { targetId: string; _id: string }) => f.targetId === targetId
        );

        if (favorite) {
          const response = await fetch(`/api/v2/crm/favorites/${favorite._id}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to remove favorite');
          }
        }
      }

      onToggle?.(newIsFavorite);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // Revert optimistic update
      setIsFavorite(!newIsFavorite);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to ${newIsFavorite ? 'add' : 'remove'} favorite. Please try again.`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const buttonSizes = {
    sm: 'size-7',
    default: 'size-9',
    lg: 'size-11',
  };

  const iconSizes = {
    sm: 'size-3.5',
    default: 'size-4',
    lg: 'size-5',
  };

  const button = (
    <Button
      variant={variant}
      size="icon"
      className={cn(buttonSizes[size], 'relative')}
      onClick={handleToggle}
      disabled={isLoading}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Star
        className={cn(
          iconSizes[size],
          'transition-all duration-200',
          isFavorite && 'fill-yellow-400 text-yellow-400',
          !isFavorite && 'text-muted-foreground hover:text-foreground',
          isAnimating && 'animate-pulse scale-125'
        )}
      />
    </Button>
  );

  if (!showTooltip) {
    return button;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>
          <p>{isFavorite ? 'Remove from favorites' : 'Add to favorites'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
