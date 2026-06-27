'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface User {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface OwnerSelectorProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  className?: string;
}

export function OwnerSelector({ value, onChange, className }: OwnerSelectorProps) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/v2/admin/users?limit=100', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedUser = users.find((user) => user._id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between', className)}
        >
          {selectedUser ? (
            <div className="flex items-center gap-2">
              <Avatar className="size-6">
                <AvatarImage src={selectedUser.avatar} />
                <AvatarFallback>
                  {selectedUser.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span>{selectedUser.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Select owner...</span>
          )}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Search users..." />
          <CommandEmpty>No users found.</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {users.map((user) => (
              <CommandItem
                key={user._id}
                value={user.name}
                onSelect={() => {
                  onChange(user._id === value ? undefined : user._id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 size-4',
                    value === user._id ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <Avatar className="size-6 mr-2">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback>
                    {user.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span>{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
