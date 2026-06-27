'use client';

import {
  StickyNote,
  CheckSquare,
  Phone,
  Calendar,
  Mail,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Award,
  UserPlus,
  FileText,
  Zap,
  LucideIcon,
} from 'lucide-react';
import { ActivityType } from '@/types/crm';
import { cn } from '@/lib/utils';

interface ActivityTypeIconProps {
  type: ActivityType;
  className?: string;
  size?: number;
}

const activityIconMap: Record<ActivityType, { icon: LucideIcon; color: string; bgColor: string }> = {
  note: {
    icon: StickyNote,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  task: {
    icon: CheckSquare,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  call: {
    icon: Phone,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  meeting: {
    icon: Calendar,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  email: {
    icon: Mail,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },
  email_sent: {
    icon: Mail,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },
  message: {
    icon: MessageSquare,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
  },
  calendar_event: {
    icon: Calendar,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  deal_created: {
    icon: TrendingUp,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  deal_stage_changed: {
    icon: TrendingUp,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  deal_won: {
    icon: Award,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  deal_lost: {
    icon: TrendingDown,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  contact_created: {
    icon: UserPlus,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  form_submission: {
    icon: FileText,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  workflow_triggered: {
    icon: Zap,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
  },
};

export function ActivityTypeIcon({ type, className, size = 16 }: ActivityTypeIconProps) {
  const config = activityIconMap[type] || activityIconMap.note;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full p-2',
        config.bgColor,
        className
      )}
    >
      <Icon className={cn('flex-shrink-0', config.color)} size={size} />
    </div>
  );
}
