'use client';

import { useReducer, useState } from 'react';
import useSWR from 'swr';
import { useSession } from '@/lib/auth-client';
import { formatDistanceToNow } from 'date-fns';
import { ThumbsUp, Loader2, Star } from 'lucide-react';
import { Button, Skeleton, Textarea } from '@/components/ui-kit';
import { TemplateRating } from './template-rating';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Review {
    _id: string;
    userId: string;
    userName: string;
    rating: number;
    comment?: string;
    helpfulCount: number;
    isOwn: boolean;
    createdAt: string;
}

const fetcher = async (url: string) => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json();
};

interface ReviewSectionProps {
    templateId: string;
    templateRating: number;
    templateRatingCount: number;
}

interface ReviewFormState {
    showForm: boolean;
    myRating: number;
    myComment: string;
}

type ReviewFormAction =
    | { type: 'open' }
    | { type: 'reset' }
    | { type: 'setRating'; rating: number }
    | { type: 'setComment'; comment: string };

const initialReviewFormState: ReviewFormState = {
    showForm: false,
    myRating: 0,
    myComment: '',
};

function reviewFormReducer(state: ReviewFormState, action: ReviewFormAction): ReviewFormState {
    switch (action.type) {
        case 'open':
            return { ...state, showForm: true };
        case 'reset':
            return initialReviewFormState;
        case 'setRating':
            return { ...state, myRating: action.rating };
        case 'setComment':
            return { ...state, myComment: action.comment };
        default:
            return state;
    }
}

export function ReviewSection({ templateId, templateRating, templateRatingCount }: ReviewSectionProps) {
    const { data: session } = useSession();
    const { toast } = useToast();

    const { data, isLoading, mutate } = useSWR<{ reviews: Review[]; pagination: Record<string, unknown> }>(
        `/api/v2/canvas-templates/${templateId}/reviews?limit=5`,
        fetcher
    );

    const [form, dispatchForm] = useReducer(reviewFormReducer, initialReviewFormState);
    const { showForm, myRating, myComment } = form;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [votingId, setVotingId] = useState<string | null>(null);
    const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

    const reviews = data?.reviews || [];
    const myReview = reviews.find((r) => r.isOwn);

    const handleSubmit = async () => {
        if (!myRating) {
            toast({ variant: 'destructive', title: 'Please select a star rating' });
            return;
        }
        try {
            setIsSubmitting(true);
            const res = await fetch(`/api/v2/canvas-templates/${templateId}/reviews`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ rating: myRating, comment: myComment }),
            });
            if (!res.ok) throw new Error('Failed to submit');
            toast({ title: 'Review submitted' });
            dispatchForm({ type: 'reset' });
            mutate();
        } catch {
            toast({ variant: 'destructive', title: 'Failed to submit review' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleHelpful = async (reviewId: string) => {
        if (votedIds.has(reviewId) || votingId) return;
        try {
            setVotingId(reviewId);
            const res = await fetch(`/api/v2/canvas-templates/${templateId}/reviews/${reviewId}/helpful`, {
                method: 'POST',
                credentials: 'include',
            });
            if (!res.ok) throw new Error();
            setVotedIds((prev) => new Set(prev).add(reviewId));
            mutate();
        } catch {
            toast({ variant: 'destructive', title: 'Failed to mark as helpful' });
        } finally {
            setVotingId(null);
        }
    };

    const handleDelete = async () => {
        try {
            setIsDeleting(true);
            await fetch(`/api/v2/canvas-templates/${templateId}/reviews`, {
                method: 'DELETE',
                credentials: 'include',
            });
            toast({ title: 'Review removed' });
            mutate();
        } catch {
            toast({ variant: 'destructive', title: 'Failed to remove review' });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Rating summary */}
            <div className="flex items-center gap-4">
                <div className="text-center">
                    <p className="text-4xl font-bold text-foreground">
                        {templateRating > 0 ? templateRating.toFixed(1) : '—'}
                    </p>
                    <TemplateRating rating={templateRating} size="md" className="mt-1" />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        {templateRatingCount > 0 ? `${templateRatingCount} rating${templateRatingCount !== 1 ? 's' : ''}` : 'No ratings yet'}
                    </p>
                </div>
            </div>

            {/* Leave a review CTA */}
            {session && !myReview && !showForm && (
                <Button
                    variant="outline"
                    size="sm"
                    icon={Star}
                    onClick={() => dispatchForm({ type: 'open' })}
                >
                    Leave a review
                </Button>
            )}

            {/* Review form */}
            {showForm && (
                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                    <p className="text-[13px] font-semibold text-foreground">Your review</p>
                    <TemplateRating
                        rating={0}
                        interactive
                        value={myRating}
                        onChange={(rating) => dispatchForm({ type: 'setRating', rating })}
                        size="lg"
                    />
                    <Textarea
                        placeholder="Share your experience with this template (optional)..."
                        value={myComment}
                        onChange={(e) => dispatchForm({ type: 'setComment', comment: e.target.value })}
                        className="resize-none text-[13px]"
                        rows={3}
                        maxLength={500}
                    />
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="primary"
                            onClick={handleSubmit}
                            disabled={isSubmitting || myRating === 0}
                        >
                            {isSubmitting ? <Loader2 className="size-3 animate-spin" /> : 'Submit'}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => dispatchForm({ type: 'reset' })}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {/* Own review */}
            {myReview && (
                <div className="rounded-xl border border-border bg-muted/30 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <div className="flex items-center gap-2">
                                <p className="text-[12px] font-semibold text-foreground">{myReview.userName}</p>
                                <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-foreground">You</span>
                            </div>
                            <TemplateRating rating={myReview.rating} size="sm" className="mt-1" />
                            {myReview.comment && (
                                <p className="mt-1.5 text-[12px] text-muted-foreground">{myReview.comment}</p>
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="text-muted-foreground hover:text-destructive"
                        >
                            {isDeleting ? <Loader2 className="size-3 animate-spin" /> : 'Remove'}
                        </Button>
                    </div>
                </div>
            )}

            {/* Review list */}
            {isLoading ? (
                <div className="space-y-3">
                    {[0, 1].map((i) => (
                        <div key={i} className="rounded-xl border border-border bg-muted/30 p-3.5">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="mt-2 h-3 w-full" />
                        </div>
                    ))}
                </div>
            ) : reviews.filter((r) => !r.isOwn).length === 0 && !myReview ? (
                <p className="text-[12px] text-muted-foreground">No reviews yet. Be the first to leave one.</p>
            ) : (
                <div className="space-y-3">
                    {reviews.filter((r) => !r.isOwn).map((review) => (
                        <div key={review._id} className="rounded-xl border border-border bg-muted/30 p-3.5">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-[12px] font-semibold text-foreground">{review.userName}</p>
                                        <TemplateRating rating={review.rating} size="sm" />
                                        <span className="text-[10px] text-muted-foreground">
                                            {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                                        </span>
                                    </div>
                                    {review.comment && (
                                        <p className="mt-1.5 text-[12px] text-muted-foreground">{review.comment}</p>
                                    )}
                                </div>
                                {session && (
                                    <button
                                        type="button"
                                        onClick={() => handleHelpful(review._id)}
                                        disabled={votedIds.has(review._id) || votingId === review._id}
                                        className={cn(
                                            'flex items-center gap-1 flex-shrink-0 text-[10px] transition-colors',
                                            votedIds.has(review._id)
                                                ? 'text-brand-strong cursor-default'
                                                : 'text-muted-foreground hover:text-foreground'
                                        )}
                                        title="Mark as helpful"
                                    >
                                        {votingId === review._id
                                            ? <Loader2 className="size-3 animate-spin" />
                                            : <ThumbsUp className={cn('size-3', votedIds.has(review._id) && 'fill-brand-strong')} />
                                        }
                                        {review.helpfulCount > 0 && review.helpfulCount}
                                    </button>
                                )}
                                {!session && review.helpfulCount > 0 && (
                                    <div className="flex items-center gap-1 flex-shrink-0 text-[10px] text-muted-foreground">
                                        <ThumbsUp className="size-3" />
                                        {review.helpfulCount}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
