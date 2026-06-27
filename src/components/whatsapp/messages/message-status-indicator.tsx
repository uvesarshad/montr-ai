'use client';

import React from 'react';
import { Check, CheckCheck, Clock, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Chip, type ChipTone } from '@/components/ui-kit';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MessageStatusIndicatorProps {
  status: 'scheduled' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  errorMessage?: string;
  variant?: 'icon' | 'badge' | 'both';
  size?: 'sm' | 'md' | 'lg';
}

export function MessageStatusIndicator({
  status,
  sentAt,
  deliveredAt,
  readAt,
  errorMessage,
  variant = 'icon',
  size = 'md',
}: MessageStatusIndicatorProps) {
  const iconSize = {
    sm: 'size-3',
    md: 'size-4',
    lg: 'size-5',
  }[size];

  const getStatusConfig = (): {
    icon: React.ReactNode;
    color: string;
    chipTone: ChipTone;
    label: string;
    description: string;
  } => {
    switch (status) {
      case 'scheduled':
        return {
          icon: <Clock className={iconSize} />,
          color: 'text-warning',
          chipTone: 'warn',
          label: 'Scheduled',
          description: 'Message is scheduled to be sent',
        };
      case 'sending':
        return {
          icon: <Loader2 className={cn(iconSize, 'animate-spin')} />,
          color: 'text-info',
          chipTone: 'info',
          label: 'Sending',
          description: 'Message is being sent',
        };
      case 'sent':
        return {
          icon: <Check className={iconSize} />,
          color: 'text-muted-foreground',
          chipTone: 'gray',
          label: 'Sent',
          description: sentAt
            ? `Sent at ${new Date(sentAt).toLocaleString()}`
            : 'Message sent to WhatsApp',
        };
      case 'delivered':
        return {
          icon: <CheckCheck className={iconSize} />,
          color: 'text-muted-foreground',
          chipTone: 'gray',
          label: 'Delivered',
          description: deliveredAt
            ? `Delivered at ${new Date(deliveredAt).toLocaleString()}`
            : 'Message delivered to recipient',
        };
      case 'read':
        return {
          icon: <CheckCheck className={iconSize} />,
          color: 'text-info',
          chipTone: 'info',
          label: 'Read',
          description: readAt
            ? `Read at ${new Date(readAt).toLocaleString()}`
            : 'Message read by recipient',
        };
      case 'failed':
        return {
          icon: <XCircle className={iconSize} />,
          color: 'text-destructive',
          chipTone: 'danger',
          label: 'Failed',
          description: errorMessage || 'Message delivery failed',
        };
      default:
        return {
          icon: <Clock className={iconSize} />,
          color: 'text-muted-foreground',
          chipTone: 'gray',
          label: 'Unknown',
          description: 'Unknown status',
        };
    }
  };

  const config = getStatusConfig();

  // Icon only variant
  if (variant === 'icon') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('inline-flex items-center', config.color)}>
              {config.icon}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Badge only variant
  if (variant === 'badge') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Chip tone={config.chipTone}>
                {config.icon}
                {config.label}
              </Chip>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{config.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Both icon and badge
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <div className={cn('inline-flex items-center', config.color)}>
              {config.icon}
            </div>
            <Chip tone={config.chipTone}>{config.label}</Chip>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Compact message status for message lists
export function CompactMessageStatus({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <MessageStatusIndicator
      status={status as MessageStatusIndicatorProps['status']}
      variant="icon"
      size="sm"
      // @ts-expect-error
      className={className}
    />
  );
}

// Full message status card
export function MessageStatusCard({
  status,
  sentAt,
  deliveredAt,
  readAt,
  errorMessage,
  retryCount,
  maxRetries,
}: {
  status: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  errorMessage?: string;
  retryCount?: number;
  maxRetries?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Message Status</span>
        <MessageStatusIndicator
          status={status as MessageStatusIndicatorProps['status']}
          sentAt={sentAt}
          deliveredAt={deliveredAt}
          readAt={readAt}
          errorMessage={errorMessage}
          variant="badge"
        />
      </div>

      {/* Timeline */}
      <div className="space-y-1 text-xs text-muted-foreground">
        {sentAt && (
          <div className="flex items-center gap-2">
            <Check className="size-3" />
            <span>Sent: {new Date(sentAt).toLocaleString()}</span>
          </div>
        )}
        {deliveredAt && (
          <div className="flex items-center gap-2">
            <CheckCheck className="size-3" />
            <span>Delivered: {new Date(deliveredAt).toLocaleString()}</span>
          </div>
        )}
        {readAt && (
          <div className="flex items-center gap-2">
            <CheckCheck className="size-3 text-info" />
            <span>Read: {new Date(readAt).toLocaleString()}</span>
          </div>
        )}
        {errorMessage && (
          <div className="flex items-start gap-2 text-destructive">
            <XCircle className="size-3 mt-0.5" />
            <div>
              <div className="font-medium">Error:</div>
              <div>{errorMessage}</div>
              {retryCount !== undefined && maxRetries !== undefined && (
                <div className="mt-1">
                  Retry attempts: {retryCount} / {maxRetries}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
