'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, Sparkles, Star, Target, Zap } from 'lucide-react';
import { updateTaskStatus } from '@/app/actions/marketing-plan';
import {
  DashboardPanel,
  DashboardPanelHeader,
} from '@/components/dashboard/dashboard-primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { openAgentLauncher } from '@/lib/agent/launcher';
import { cn } from '@/lib/utils';
import { IMarketingPlan, IMarketingTask } from '@/lib/db/models/marketing-plan.model';

interface MarketingRoadmapProps {
  initialPlan: IMarketingPlan | null;
  brandId?: string;
}

export function MarketingRoadmap({ initialPlan, brandId }: MarketingRoadmapProps) {
  const [plan, setPlan] = useState<IMarketingPlan | null>(initialPlan);
  const [isLoading, setIsLoading] = useState<string | null>(null);

  useEffect(() => {
    setPlan(initialPlan);
  }, [initialPlan]);

  const handleTaskToggle = async (taskId: string, currentStatus: string) => {
    if (!plan || !brandId) return;

    const nextStatus: 'pending' | 'completed' =
      currentStatus === 'completed' ? 'pending' : 'completed';
    const updatedTasks = plan.tasks.map((task: IMarketingTask) =>
      task.id === taskId ? { ...task, status: nextStatus } : task
    );

    let nextXp = plan.currentXp;
    let nextLevel = plan.currentLevel;
    const activeTask = plan.tasks.find((task: IMarketingTask) => task.id === taskId);

    if (nextStatus === 'completed' && activeTask) {
      nextXp += activeTask.xpReward || 10;
      if (nextXp >= nextLevel * 100) {
        nextLevel++;
        nextXp -= nextLevel * 100;
      }
    }

    // Keep the panel responsive while the action completes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setPlan({ ...plan, tasks: updatedTasks, currentXp: nextXp, currentLevel: nextLevel } as any);
    setIsLoading(taskId);

    try {
      const updatedPlan = await updateTaskStatus(taskId, nextStatus as 'pending' | 'completed' | 'in_progress', brandId);
      if (updatedPlan) {
        setPlan(updatedPlan);
      }
    } catch (error) {
      console.error('Failed to update task', error);
    } finally {
      setIsLoading(null);
    }
  };

  const completedTasks = plan?.tasks?.filter((task: IMarketingTask) => task.status === 'completed').length || 0;
  const totalTasks = plan?.tasks?.length || 0;
  const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  const askAgentHelp = (task: IMarketingTask) => {
    openAgentLauncher({
      prompt: `Can you help me with this marketing roadmap task: "${task.title}"?\nDescription: ${task.description}`,
      context: {
        source: 'marketing_roadmap',
        entityType: 'roadmap_task',
        entityId: task.id,
        entityLabel: task.title,
        route: brandId ? `/dashboard?brandId=${brandId}` : '/dashboard',
        notes: [
          `Difficulty: ${task.difficulty}`,
          `Status: ${task.status}`,
        ].filter((note): note is string => Boolean(note)),
      },
    });
  };

  const executeTask = (task: IMarketingTask) => {
    openAgentLauncher({
      prompt: `Execute my roadmap task: "${task.title}" - ${task.description}`,
      context: {
        source: 'marketing_roadmap',
        entityType: 'roadmap_task',
        entityId: task.id,
        entityLabel: task.title,
        route: brandId ? `/dashboard?brandId=${brandId}` : '/dashboard',
        notes: [
          `Difficulty: ${task.difficulty}`,
          `Status: ${task.status}`,
        ].filter((note): note is string => Boolean(note)),
      },
    });
  };

  return (
    <DashboardPanel className="flex h-full flex-col">
      <DashboardPanelHeader
        eyebrow="Roadmap"
        title="Marketing Roadmap"
        actions={
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="rounded-full border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-500"
            >
              Level {plan?.currentLevel || 1}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-border/60 bg-background/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              {plan?.currentXp || 0} XP
            </Badge>
          </div>
        }
      />

      <CardContent className="flex flex-1 flex-col p-0">
        <div className="border-b border-border/60 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {completedTasks} of {totalTasks} tasks completed
              </p>
              <p className="text-sm font-medium text-foreground">
                {plan?.onboardingCompleted
                  ? 'Current plan is active.'
                  : 'Finish onboarding to unlock the full roadmap.'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                {Math.round(progressPercentage)}%
              </p>
              <p className="text-xs text-muted-foreground">progress</p>
            </div>
          </div>
          <Progress value={progressPercentage} className="mt-4 h-2.5 rounded-full bg-muted/70" />
        </div>

        {!plan || !plan.tasks || plan.tasks.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-[12px] border border-border/60 bg-muted/50 text-muted-foreground">
              <Target className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No roadmap tasks yet</p>
              <p className="text-xs leading-5 text-muted-foreground">
                Complete onboarding to generate the first set of marketing actions.
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="space-y-3 px-5 py-4">
              {plan.tasks.map((task: IMarketingTask) => {
                const isTaskLoading = isLoading === task.id;
                return (
                  <div
                    key={task.id}
                    className={cn(
                      'rounded-[12px] border border-border/60 bg-background/60 p-4 transition-colors',
                      task.status === 'completed' && 'border-border/40 bg-muted/30'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={task.status === 'completed'}
                        onCheckedChange={() => handleTaskToggle(task.id, task.status)}
                        disabled={isTaskLoading}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-3">
                            <p
                              className={cn(
                                'text-sm font-semibold leading-5 text-foreground',
                                task.status === 'completed' && 'text-muted-foreground line-through'
                              )}
                            >
                              {task.title}
                            </p>
                            <Badge
                              variant="outline"
                              className="rounded-full border-border/60 bg-background/70 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
                            >
                              +{task.xpReward} XP
                            </Badge>
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">{task.description}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {task.dueDate ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-1">
                              <Calendar className="size-3" />
                              {format(new Date(task.dueDate), 'MMM d')}
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2 py-1 uppercase tracking-[0.16em]',
                              task.difficulty === 'easy' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
                              task.difficulty === 'medium' && 'border-amber-500/20 bg-amber-500/10 text-amber-500',
                              task.difficulty === 'hard' && 'border-rose-500/20 bg-rose-500/10 text-rose-500'
                            )}
                          >
                            {task.difficulty}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-1">
                            <Star className="size-3" />
                            {task.status.replace('_', ' ')}
                          </span>
                        </div>

                        {task.status !== 'completed' ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-[0.4rem] border-emerald-500/20 bg-emerald-500/10 px-3 text-xs text-emerald-500 hover:bg-emerald-500/15 hover:text-emerald-600"
                              onClick={(event) => {
                                event.stopPropagation();
                                executeTask(task);
                              }}
                            >
                              <Zap className="size-3.5" />
                              Execute
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-[0.4rem] border-primary/20 bg-primary/10 px-3 text-xs text-primary hover:bg-primary/15"
                              onClick={(event) => {
                                event.stopPropagation();
                                askAgentHelp(task);
                              }}
                            >
                              <Sparkles className="size-3.5" />
                              Help
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </DashboardPanel>
  );
}
