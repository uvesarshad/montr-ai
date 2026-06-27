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
import { Loader2, Trophy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Deal } from '@/types/crm';

const markWonSchema = z.object({
  wonReason: z.string().max(500).optional(),
  actualCloseDate: z.string().optional(),
  actualValue: z.coerce.number().min(0).optional(),
});

type MarkWonInput = z.infer<typeof markWonSchema>;

interface MarkWonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
  onSuccess?: () => void;
}

export function MarkWonDialog({ open, onOpenChange, deal, onSuccess }: MarkWonDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<MarkWonInput>({
    resolver: zodResolver(markWonSchema),
    defaultValues: {
      wonReason: '',
      actualCloseDate: new Date().toISOString().split('T')[0],
      actualValue: deal.value,
    },
  });

  const handleSubmit = async (data: MarkWonInput) => {
    try {
      setIsSubmitting(true);

      const payload: { wonReason?: string; actualCloseDate?: Date; actualValue?: number } = {
        wonReason: data.wonReason || undefined,
      };

      if (data.actualCloseDate) {
        payload.actualCloseDate = new Date(data.actualCloseDate);
      }

      if (data.actualValue !== undefined && data.actualValue !== deal.value) {
        payload.actualValue = data.actualValue;
      }

      const response = await fetch(`/api/v2/crm/deals/${deal._id}/won`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to mark deal as won');
      }

      toast({
        title: 'Success',
        description: 'Deal marked as won successfully',
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error marking deal as won:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to mark deal as won',
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
            <div className="size-10 rounded-full bg-green-100 flex items-center justify-center">
              <Trophy className="size-5 text-green-600" />
            </div>
            <div>
              <DialogTitle>Mark Deal as Won</DialogTitle>
              <DialogDescription>
                Congratulations! Record the details of this won deal.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="wonReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Win (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What helped close this deal?"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Share what worked well to help improve future deals
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
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

              <FormField
                control={form.control}
                name="actualValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Actual Value</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Original: {deal.currency} {deal.value.toLocaleString()}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                Mark as Won
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
