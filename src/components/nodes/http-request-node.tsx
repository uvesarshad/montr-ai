'use client';

import React, { memo, useState } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NodeShell from './node-shell';
import { Globe, Plus, X, ArrowUp, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import NodeHandle from './node-handle';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const AUTH_TYPES = [
  { value: 'none', label: 'No Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'api_key', label: 'API Key' },
];

const RESPONSE_FORMATS = [
  { value: 'auto', label: 'Auto (sniff)' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'binary-base64', label: 'Binary (base64, ≤1MB)' },
];

const PAGINATION_MODES = [
  { value: 'off', label: 'Off' },
  { value: 'next_link', label: 'Follow next-link' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'offset', label: 'Offset / limit' },
];

interface HeaderEntry {
  key: string;
  value: string;
}

const HttpRequestNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, propagateToOutgoers } = useNodeUtils(id);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const method = data.method || 'GET';
  const url = data.url || '';
  const body = data.body || '';
  const authType = data.authType || 'none';
  const authValue = data.authValue || '';
  const headers: HeaderEntry[] = data.headers || [];

  // ---- Advanced (item 2.6 / H28) ----
  const isMutating = method !== 'GET' && method !== 'HEAD';
  const retryOnFail = data.retryOnFail ?? !isMutating; // default ON for GET/HEAD only
  const maxRetries = data.maxRetries ?? 3;
  const retryDelayMs = data.retryDelayMs ?? 1000;
  const followRedirects = data.followRedirects !== false; // default true
  const responseFormat = data.responseFormat || 'auto';
  const pagination = (data.pagination || {}) as Record<string, unknown>;
  const paginationMode = (pagination.mode as string) || 'off';

  const updatePagination = (patch: Record<string, unknown>) => {
    updateNodeData({ pagination: { ...pagination, ...patch } });
  };

  const addHeader = () => {
    updateNodeData({ headers: [...headers, { key: '', value: '' }] });
  };

  const removeHeader = (index: number) => {
    updateNodeData({ headers: headers.filter((_, i) => i !== index) });
  };

  const updateHeader = (index: number, field: 'key' | 'value', val: string) => {
    updateNodeData({
      headers: headers.map((h, i) => i === index ? { ...h, [field]: val } : h),
    });
  };

  const handleTest = async () => {
    if (!url.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please enter a URL.' });
      return;
    }
    setIsLoading(true);
    try {
      const requestHeaders: Record<string, string> = {};
      headers.forEach(h => { if (h.key) requestHeaders[h.key] = h.value; });

      if (authType === 'bearer' && authValue) requestHeaders['Authorization'] = `Bearer ${authValue}`;
      if (authType === 'api_key' && authValue) requestHeaders['X-API-Key'] = authValue;

      const resp = await fetch('/api/v2/proxy-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, url, headers: requestHeaders, body: method !== 'GET' ? body : undefined }),
      });

      const result = await resp.json();
      updateNodeData({ lastResponse: result, lastStatus: resp.status });
      propagateToOutgoers(typeof result === 'string' ? result : JSON.stringify(result));
      toast({ title: 'Request Complete', description: `Status: ${resp.status}` });
    } catch (error) {
      console.error('HTTP request failed:', error);
      toast({ variant: 'destructive', title: 'Request Failed', description: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <NodeShell
      id={id}
      nodeType="httpRequestNode"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={320}
      minHeight={350}
      contentClassName="p-4 relative h-full flex flex-col"
      title="HTTP Request"
      icon={<Globe className="h-full w-full" />}
    >
      <NodeHandle type="target" position={Position.Left} nodeType="httpRequestNode" isConnectable={isConnectable} />
      <div className="nodrag flex flex-col h-full w-full gap-y-3 overflow-y-auto">
        {/* Method + URL */}
        <div className="flex items-center gap-1.5">
          <Select value={method} onValueChange={(v) => updateNodeData({ method: v })}>
            <SelectTrigger className="h-8 text-xs rounded-full w-[90px] shrink-0 font-mono font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map(m => (
                <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={url}
            onChange={(e) => updateNodeData({ url: e.target.value })}
            className="h-8 text-xs rounded-full flex-1 font-mono"
            placeholder="https://api.example.com/endpoint"
          />
        </div>

        {/* Auth */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Authentication</Label>
          <div className="flex items-center gap-1.5">
            <Select value={authType} onValueChange={(v) => updateNodeData({ authType: v })}>
              <SelectTrigger className="h-7 text-xs rounded-full w-[110px] shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUTH_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {authType !== 'none' && (
              <Input
                value={authValue}
                onChange={(e) => updateNodeData({ authValue: e.target.value })}
                className="h-7 text-xs rounded-full flex-1"
                placeholder={authType === 'bearer' ? 'Token' : authType === 'basic' ? 'user:pass' : 'API Key'}
                type="password"
              />
            )}
          </div>
        </div>

        {/* Headers */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Headers</Label>
            <Button variant="ghost" size="icon" onClick={addHeader} className="size-5 rounded-full">
              <Plus className="size-3" />
            </Button>
          </div>
          {headers.map((h, i) => (
            <div key={`header-${i}`} className="flex items-center gap-1 group">
              <Input value={h.key} onChange={(e) => updateHeader(i, 'key', e.target.value)}
                className="h-6 text-[10px] rounded-lg flex-1 font-mono" placeholder="Key" />
              <Input value={h.value} onChange={(e) => updateHeader(i, 'value', e.target.value)}
                className="h-6 text-[10px] rounded-lg flex-1 font-mono" placeholder="Value" />
              <button type="button" onClick={() => removeHeader(i)} className="opacity-0 group-hover:opacity-100">
                <X className="size-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>

        {/* Body (only for POST/PUT/PATCH) */}
        {method !== 'GET' && method !== 'DELETE' && (
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Body</Label>
            <Textarea
              value={body}
              onChange={(e) => updateNodeData({ body: e.target.value })}
              className="nodrag text-[10px] font-mono min-h-[50px] resize-none rounded-xl bg-muted/30 border-border/30"
              placeholder='{"key": "value"}'
            />
          </div>
        )}

        {/* Advanced settings (retry / pagination / redirects / response format) */}
        <div className="space-y-2 pt-1 border-t border-border/30">
          <button
            type="button"
            data-http-advanced-toggle
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Advanced
          </button>

          {showAdvanced && (
            <div data-http-advanced-body className="space-y-3 pl-1">
              {/* Retry / backoff */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={retryOnFail}
                    onChange={(e) => updateNodeData({ retryOnFail: e.target.checked })}
                    className="size-3 accent-current"
                  />
                  Retry on failure (429 / 5xx / network)
                  {isMutating && (
                    <span className="text-amber-600">— opt-in for non-idempotent {method}</span>
                  )}
                </label>
                {retryOnFail && (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={0}
                      max={5}
                      value={maxRetries}
                      onChange={(e) => updateNodeData({ maxRetries: Number(e.target.value) })}
                      className="h-6 text-[10px] rounded-lg w-[70px]"
                      placeholder="Retries"
                    />
                    <span className="text-[9px] text-muted-foreground">retries (max 5)</span>
                    <Input
                      type="number"
                      min={0}
                      max={30000}
                      value={retryDelayMs}
                      onChange={(e) => updateNodeData({ retryDelayMs: Number(e.target.value) })}
                      className="h-6 text-[10px] rounded-lg w-[90px]"
                      placeholder="Delay ms"
                    />
                    <span className="text-[9px] text-muted-foreground">base ms (jittered)</span>
                  </div>
                )}
              </div>

              {/* Redirects */}
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={followRedirects}
                  onChange={(e) => updateNodeData({ followRedirects: e.target.checked })}
                  className="size-3 accent-current"
                />
                Follow redirects (max 5; auth stripped cross-origin)
              </label>

              {/* Response format */}
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Response format</Label>
                <Select value={responseFormat} onValueChange={(v) => updateNodeData({ responseFormat: v })}>
                  <SelectTrigger className="h-7 text-xs rounded-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESPONSE_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Pagination */}
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Pagination</Label>
                <Select value={paginationMode} onValueChange={(v) => updatePagination({ mode: v })}>
                  <SelectTrigger className="h-7 text-xs rounded-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGINATION_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {paginationMode !== 'off' && (
                  <div className="space-y-1.5">
                    {paginationMode === 'next_link' && (
                      <Input
                        value={(pagination.nextLinkPath as string) || ''}
                        onChange={(e) => updatePagination({ nextLinkPath: e.target.value })}
                        className="h-6 text-[10px] rounded-lg font-mono"
                        placeholder="Next-URL path (e.g. paging.next)"
                      />
                    )}
                    {paginationMode === 'cursor' && (
                      <div className="flex items-center gap-1">
                        <Input
                          value={(pagination.cursorPath as string) || ''}
                          onChange={(e) => updatePagination({ cursorPath: e.target.value })}
                          className="h-6 text-[10px] rounded-lg flex-1 font-mono"
                          placeholder="Cursor path (e.g. next_cursor)"
                        />
                        <Input
                          value={(pagination.cursorParam as string) || ''}
                          onChange={(e) => updatePagination({ cursorParam: e.target.value })}
                          className="h-6 text-[10px] rounded-lg flex-1 font-mono"
                          placeholder="Cursor param (e.g. cursor)"
                        />
                      </div>
                    )}
                    {paginationMode === 'offset' && (
                      <div className="flex items-center gap-1">
                        <Input
                          value={(pagination.offsetParam as string) || ''}
                          onChange={(e) => updatePagination({ offsetParam: e.target.value })}
                          className="h-6 text-[10px] rounded-lg flex-1 font-mono"
                          placeholder="offset param"
                        />
                        <Input
                          value={(pagination.limitParam as string) || ''}
                          onChange={(e) => updatePagination({ limitParam: e.target.value })}
                          className="h-6 text-[10px] rounded-lg flex-1 font-mono"
                          placeholder="limit param"
                        />
                        <Input
                          type="number"
                          value={(pagination.limit as number) ?? ''}
                          onChange={(e) => updatePagination({ limit: Number(e.target.value) })}
                          className="h-6 text-[10px] rounded-lg w-[60px]"
                          placeholder="size"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Input
                        value={(pagination.itemsPath as string) || ''}
                        onChange={(e) => updatePagination({ itemsPath: e.target.value })}
                        className="h-6 text-[10px] rounded-lg flex-1 font-mono"
                        placeholder="Items array path (e.g. data) — optional"
                      />
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={(pagination.maxPages as number) ?? ''}
                        onChange={(e) => updatePagination({ maxPages: Number(e.target.value) })}
                        className="h-6 text-[10px] rounded-lg w-[70px]"
                        placeholder="maxPages"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Test Button */}
        <Button
          onClick={handleTest}
          disabled={isLoading || !url.trim()}
          size="sm"
          className="h-8 rounded-full gap-1.5 self-end"
        >
          {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
          Send
        </Button>
      </div>
      <NodeHandle type="source" position={Position.Right} nodeType="httpRequestNode" isConnectable={isConnectable} />
    </NodeShell>
  );
};

export default memo(HttpRequestNode);
