'use client';

import { useState } from 'react';
import { Email } from '@/hooks/crm/use-emails';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Star, Paperclip, MoreVertical, Mail, MailOpen, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface EmailItemProps {
  email: Email;
  onMarkRead: (id: string) => Promise<void>;
  onMarkUnread: (id: string) => Promise<void>;
  onToggleStar: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function EmailItem({
  email,
  onMarkRead,
  onMarkUnread,
  onToggleStar,
  onDelete,
}: EmailItemProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleToggleStar = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsProcessing(true);
    try {
      await onToggleStar(email.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkRead = async () => {
    setIsProcessing(true);
    try {
      await onMarkRead(email.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkUnread = async () => {
    setIsProcessing(true);
    try {
      await onMarkUnread(email.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    setIsProcessing(true);
    try {
      await onDelete(email.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const senderName = email.from.name || email.from.email;
  const recipients = email.to.map((r) => r.name || r.email).join(', ');

  return (
    <Link href={`/crm/emails/${email.id}`}>
      <div
        className={cn(
          'group flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors',
          !email.isRead && 'bg-muted/30'
        )}
      >
        {/* Star button */}
        <button
          onClick={handleToggleStar}
          disabled={isProcessing}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Star
            className={cn(
              'size-4',
              email.isStarred && 'fill-yellow-400 text-yellow-400'
            )}
          />
        </button>

        {/* Sender */}
        <div className="w-48 shrink-0">
          <div className={cn('truncate', !email.isRead && 'font-semibold')}>
            {email.direction === 'outbound' ? `To: ${recipients}` : senderName}
          </div>
        </div>

        {/* Subject and snippet */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('truncate', !email.isRead && 'font-semibold')}>
              {email.subject || '(No Subject)'}
            </span>
            {email.hasAttachments && (
              <Paperclip className="size-3 text-muted-foreground" />
            )}
            {email.isLinked && (
              <Badge variant="outline" className="text-xs">
                Linked
              </Badge>
            )}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {email.snippet}
          </div>
        </div>

        {/* Date */}
        <div className="shrink-0 text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(email.date), { addSuffix: true })}
        </div>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0 opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {email.isRead ? (
              <DropdownMenuItem onClick={handleMarkUnread}>
                <Mail className="mr-2 size-4" />
                Mark as unread
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={handleMarkRead}>
                <MailOpen className="mr-2 size-4" />
                Mark as read
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Link>
  );
}
