'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Deal } from '@/types/crm';

const markLostSchema = z.object({
  lostReason: z.string().min(1, 'Please provide a reason').max(500),
  actualCloseDate: z.string().optional(),
});

type MarkLostInput = z.infer<typeof markLostSchema>;

interface MarkLostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
  onSuccess?: () => void;
}

export function MarkLostDialog({ open, onOpenChange, deal, onSuccess }: MarkLostDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<MarkLostInput>({
    resolver: zodResolver(markLostSchema),
    defaultValues: {
      lostReason: '',
      actualCloseDate: new Date().toISOString().split('T')[0],
    },
  });

  const handleSubmit = async (data: MarkLostInput) => {
    try {
      setIsSubmitting(true);

      const payload: { lostReason: string; actualCloseDate?: Date } = {
        lostReason: data.lostReason,
      };

      if (data.actualCloseDate) {
        payload.actualCloseDate = new Date(data.actualCloseDate);
      }

      const response = await fetch(`/api/v2/crm/deals/${deal._id}/lost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to mark deal as lost');
      }

      toast({
        title: 'Success',
        description: 'Deal marked as lost',
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error marking deal as lost:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to mark deal as lost',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-10 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="size-5 text-red-600" />
            </div>
            <div>
              <DialogTitle>Mark Deal as Lost</DialogTitle>
              <DialogDescription>
                Record why this deal was lost to help improve future opportunities.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="lostReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Loss *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Why was this deal lost? (e.g., price, competitor, timing, no budget)"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Understanding why deals are lost helps improve the sales process
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="actualCloseDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Close Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                Mark as Lost
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
