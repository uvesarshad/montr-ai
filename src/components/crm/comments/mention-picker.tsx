'use client';

import { useState, useEffect, useCallback } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface MentionPickerProps {
  query: string;
  onSelect: (user: User) => void;
  className?: string;
}

/**
 * Autocomplete dropdown for @mentions
 *
 * Features:
 * - Triggers on "@" character
 * - Searches users in organization
 * - Shows user avatar and name
 * - Keyboard navigation
 * - Click or Enter to insert mention
 * - Position near cursor
 *
 * Note: This is a simplified version. For full @mention support,
 * integrate with TipTap Mention extension.
 */
export function MentionPicker({ query, onSelect, className }: MentionPickerProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const searchUsers = useCallback(async (searchQuery: string) => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      params.append('limit', '10');

      const response = await fetch(`/api/v2/crm/users?${params.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    searchUsers(query);
  }, [query, searchUsers]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={cn('w-72 bg-popover border rounded-md shadow-md', className)}>
      <Command>
        <CommandList>
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : users.length === 0 ? (
            <CommandEmpty>No users found</CommandEmpty>
          ) : (
            <CommandGroup>
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.name}
                  onSelect={() => onSelect(user)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-x-3 w-full">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
