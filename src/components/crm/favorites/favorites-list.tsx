'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star, User, Building2, Briefcase } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Favorite, FavoriteTargetType, Contact, Company, Deal } from '@/types/crm';
import { useFavorites } from '@/hooks/crm/use-favorites';
import { FavoriteButton } from './favorite-button';

interface FavoritesListProps {
  className?: string;
  onItemClick?: (targetType: FavoriteTargetType, targetId: string) => void;
}

interface FavoriteWithDetails extends Favorite {
  details?: Contact | Company | Deal | null;
}

const ENTITY_ICONS = {
  contact: User,
  company: Building2,
  deal: Briefcase,
  view: Star,
};

const ENTITY_LABELS = {
  contact: 'Contacts',
  company: 'Companies',
  deal: 'Deals',
  view: 'Views',
};

export function FavoritesList({ className, onItemClick }: FavoritesListProps) {
  const router = useRouter();
  const { favorites, loading, error, refetch } = useFavorites();
  const [favoritesWithDetails, setFavoritesWithDetails] = useState<FavoriteWithDetails[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Fetch details for each favorite
  useEffect(() => {
    const fetchDetails = async () => {
      if (favorites.length === 0) return;

      setLoadingDetails(true);
      try {
        const detailsPromises = favorites.map(async (fav) => {
          try {
            const endpoint = `/api/v2/crm/${fav.targetType === 'company' ? 'companies' : `${fav.targetType}s`}/${fav.targetId}`;
            const response = await fetch(endpoint, { credentials: 'include' });

            if (!response.ok) {
              return { ...fav, details: null };
            }

            const data = await response.json();
            return { ...fav, details: data };
          } catch (err) {
            console.error(`Error fetching ${fav.targetType} details:`, err);
            return { ...fav, details: null };
          }
        });

        const results = await Promise.all(detailsPromises);
        setFavoritesWithDetails(results);
      } catch (err) {
        console.error('Error fetching favorite details:', err);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchDetails();
  }, [favorites]);

  const handleItemClick = (fav: FavoriteWithDetails) => {
    if (onItemClick) {
      onItemClick(fav.targetType, fav.targetId);
      return;
    }

    // Default navigation
    const routes: Record<FavoriteTargetType, string> = {
      contact: `/crm/contacts/${fav.targetId}`,
      company: `/crm/companies/${fav.targetId}`,
      deal: `/crm/deals/${fav.targetId}`,
      view: `/crm`, // Views would need special handling
    };

    router.push(routes[fav.targetType]);
  };

  const handleFavoriteRemoved = () => {
    refetch();
  };

  const getItemName = (fav: FavoriteWithDetails): string => {
    if (!fav.details) return 'Loading...';

    switch (fav.targetType) {
      case 'contact':
        const contact = fav.details as Contact;
        return `${contact.firstName} ${contact.lastName || ''}`.trim();
      case 'company':
        const company = fav.details as Company;
        return company.name;
      case 'deal':
        const deal = fav.details as Deal;
        return deal.name;
      default:
        return 'Unknown';
    }
  };

  const getItemSubtitle = (fav: FavoriteWithDetails): string | null => {
    if (!fav.details) return null;

    switch (fav.targetType) {
      case 'contact':
        const contact = fav.details as Contact;
        return contact.jobTitle || contact.email || null;
      case 'company':
        const company = fav.details as Company;
        return company.industry || company.domain || null;
      case 'deal':
        const deal = fav.details as Deal;
        return deal.value ? `$${deal.value.toLocaleString()}` : null;
      default:
        return null;
    }
  };

  // Group favorites by type
  const groupedFavorites = favoritesWithDetails.reduce((acc, fav) => {
    if (!acc[fav.targetType]) {
      acc[fav.targetType] = [];
    }
    acc[fav.targetType].push(fav);
    return acc;
  }, {} as Record<FavoriteTargetType, FavoriteWithDetails[]>);

  if (loading || loadingDetails) {
    return (
      <div className={cn('space-y-4', className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-4 text-center', className)}>
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
          Try Again
        </Button>
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <div className={cn('p-8 text-center', className)}>
        <Star className="size-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="text-sm font-medium mb-1">No favorites yet</h3>
        <p className="text-sm text-muted-foreground">
          Star contacts, companies, or deals to add them to your favorites.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="space-y-6 p-4">
        {(Object.keys(groupedFavorites) as FavoriteTargetType[]).map((type) => {
          const items = groupedFavorites[type];
          if (!items || items.length === 0) return null;

          const Icon = ENTITY_ICONS[type];
          const label = ENTITY_LABELS[type];

          return (
            <div key={type} className="space-y-2">
              <div className="flex items-center gap-2 px-2">
                <Icon className="size-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {label} ({items.length})
                </h3>
              </div>

              <div className="space-y-1">
                {items.map((fav) => (
                  <div
                    key={fav._id}
                    className="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent transition-colors cursor-pointer"
                  >
                    <button
                      onClick={() => handleItemClick(fav)}
                      className="flex-1 flex items-start gap-3 text-left min-w-0"
                    >
                      <div className="mt-0.5">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {getItemName(fav)}
                        </p>
                        {getItemSubtitle(fav) && (
                          <p className="text-xs text-muted-foreground truncate">
                            {getItemSubtitle(fav)}
                          </p>
                        )}
                      </div>
                    </button>

                    <FavoriteButton
                      targetType={fav.targetType}
                      targetId={fav.targetId}
                      initialIsFavorite={true}
                      size="sm"
                      variant="ghost"
                      showTooltip={false}
                      onToggle={handleFavoriteRemoved}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
