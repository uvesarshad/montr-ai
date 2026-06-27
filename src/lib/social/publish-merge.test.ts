import { it, expect } from 'vitest';

import {
    publishTargetKey,
    isSystemResult,
    successfulTargetKeys,
    mergePublishResults,
    type PublishResultLike,
} from './publish-merge';

const ok = (platform: string, accountId: string, postId?: string): PublishResultLike => ({
    platform,
    accountId,
    success: true,
    postId,
});
const fail = (platform: string, accountId: string, error = 'boom'): PublishResultLike => ({
    platform,
    accountId,
    success: false,
    error,
});
const systemFail = (error = 'stuck'): PublishResultLike => ({
    platform: 'system',
    accountId: 'system',
    success: false,
    error,
});

it('successfulTargetKeys keys on platform+account and excludes system entries', () => {
    const prior = [
        ok('x', 'acc1'),
        fail('linkedin', 'acc2'),
        ok('x', 'acc3'), // same platform, different account → distinct target
        systemFail(),
    ];

    const keys = successfulTargetKeys(prior);

    expect(keys.size).toBe(2);
    expect(keys.has(publishTargetKey({ platform: 'x', accountId: 'acc1' }))).toBeTruthy();
    expect(keys.has(publishTargetKey({ platform: 'x', accountId: 'acc3' }))).toBeTruthy();
    expect(!keys.has(publishTargetKey({ platform: 'linkedin', accountId: 'acc2' }))).toBeTruthy();
    expect(!keys.has(publishTargetKey({ platform: 'system', accountId: 'system' }))).toBeTruthy();
    expect(!isSystemResult(ok('x', 'acc1'))).toBeTruthy();
    expect(isSystemResult(systemFail())).toBeTruthy();
});

it('mergePublishResults carries prior successes forward and applies fresh results for re-attempted targets', () => {
    // Prior attempt: x succeeded, linkedin failed.
    const prior = [ok('x', 'acc1', 'tweet123'), fail('linkedin', 'acc2')];
    // Retry only re-ran linkedin and it now succeeded.
    const fresh = [ok('linkedin', 'acc2', 'li456')];

    const merged = mergePublishResults(prior, fresh);

    expect(merged.length).toBe(2);
    const x = merged.find(r => r.platform === 'x');
    const li = merged.find(r => r.platform === 'linkedin');
    expect(x?.success).toBe(true);
    expect(x?.postId).toBe('tweet123'); // carried forward unchanged
    expect(li?.success).toBe(true);
    expect(li?.postId).toBe('li456'); // replaced the prior failure
    // No duplicate linkedin entry, no leftover failure.
    expect(merged.filter(r => r.platform === 'linkedin').length).toBe(1);
});

it('mergePublishResults overwrites a prior failure with a still-failing fresh result and drops system notes', () => {
    const prior = [ok('x', 'acc1'), fail('linkedin', 'acc2', 'old error'), systemFail('whole-post crash')];
    const fresh = [fail('linkedin', 'acc2', 'new error')];

    const merged = mergePublishResults(prior, fresh);

    // x success carried, linkedin failure updated, system note dropped.
    expect(merged.length).toBe(2);
    expect(!merged.some(isSystemResult)).toBeTruthy();
    const li = merged.find(r => r.platform === 'linkedin');
    expect(li?.success).toBe(false);
    expect(li?.error).toBe('new error');
    // Still has a failed target → caller should schedule another retry.
    expect(merged.some(r => !r.success)).toBeTruthy();
});

it('mergePublishResults with empty fresh (all already succeeded) returns only carried successes', () => {
    const prior = [ok('x', 'acc1'), ok('linkedin', 'acc2'), systemFail()];
    const merged = mergePublishResults(prior, []);

    expect(merged.length).toBe(2);
    expect(merged.every(r => r.success)).toBeTruthy();
    expect(!merged.some(isSystemResult)).toBeTruthy();
});
