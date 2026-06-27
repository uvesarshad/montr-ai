'use client';

import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Play, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Banner, Button, Card, Chip, Field, Input, Textarea, type ChipTone } from '@/components/ui-kit';

interface WorkflowTestInterfaceProps {
    workflowId: string;
}

interface TestResultStep {
    status?: string;
    nodeName?: string;
    duration?: number;
    output?: unknown;
    [key: string]: unknown;
}

interface TestResult {
    status?: string;
    error?: string;
    steps?: TestResultStep[];
    output?: unknown;
    executionPath?: string[];
    variables?: Record<string, unknown>;
    [key: string]: unknown;
}

export function WorkflowTestInterface({ workflowId }: WorkflowTestInterfaceProps) {
    const { toast } = useToast();
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [testData, setTestData] = useState({
        contactId: '',
        message: '',
        variables: '{}',
    });

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);

        try {
            // Parse variables
            let variables = {};
            try {
                variables = JSON.parse(testData.variables);
            } catch (_e) {
                throw new Error('Invalid JSON in variables field');
            }

            // Execute workflow
            const response = await fetch(`/api/whatsapp/workflows/${workflowId}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contactId: testData.contactId,
                    triggerData: {
                        message: testData.message,
                        timestamp: new Date(),
                    },
                    variables: {
                        ...variables,
                        message: testData.message,
                    },
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to execute workflow');
            }

            const result = await response.json();
            setTestResult(result.execution);

            toast({
                title: 'Success',
                description: 'Workflow executed successfully',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to execute workflow';
            toast({
                title: 'Error',
                description: message,
                variant: 'destructive',
            });
            setTestResult({ error: message });
        } finally {
            setTesting(false);
        }
    };

    const statusChipTone = (status?: string): ChipTone =>
        status === 'completed' ? 'ok' : status === 'failed' ? 'danger' : 'info';

    return (
        <div className="grid grid-cols-2 gap-6">
            {/* Test Input */}
            <Card title="Test Configuration" meta="Configure test data to execute the workflow">
                <div className="space-y-4">
                    <Field label="Contact ID" hint="The contact to send messages to">
                        <Input
                            value={testData.contactId}
                            onChange={(e) =>
                                setTestData({ ...testData, contactId: e.target.value })
                            }
                            placeholder="Enter contact ID"
                        />
                    </Field>

                    <Field label="Trigger Message" hint="The message that would trigger this workflow">
                        <Textarea
                            value={testData.message}
                            onChange={(e) =>
                                setTestData({ ...testData, message: e.target.value })
                            }
                            placeholder="Enter test message"
                            rows={3}
                        />
                    </Field>

                    <Field label="Initial Variables (JSON)" hint="Optional variables to initialize the workflow with">
                        <Textarea
                            value={testData.variables}
                            onChange={(e) =>
                                setTestData({ ...testData, variables: e.target.value })
                            }
                            placeholder='{"name": "John", "order_id": "12345"}'
                            rows={6}
                            className="font-mono text-sm"
                        />
                    </Field>

                    <Button
                        icon={testing ? Loader2 : Play}
                        onClick={handleTest}
                        disabled={testing}
                        className="w-full"
                    >
                        {testing ? 'Testing…' : 'Run Test'}
                    </Button>
                </div>
            </Card>

            {/* Test Results */}
            <Card title="Test Results" meta="View the execution results and debug information">
                {!testResult ? (
                    <div className="text-center text-muted-foreground py-12">
                        Run a test to see results
                    </div>
                ) : testResult.error ? (
                    <Banner tone="danger" title="Test Failed">
                        {testResult.error}
                    </Banner>
                ) : (
                    <div className="space-y-4">
                        {/* Status */}
                        <div className="flex items-center gap-2">
                            {testResult.status === 'completed' ? (
                                <CheckCircle2 className="size-5 text-success" />
                            ) : testResult.status === 'failed' ? (
                                <XCircle className="size-5 text-destructive" />
                            ) : (
                                <Loader2 className="size-5 text-info animate-spin" />
                            )}
                            <Chip tone={statusChipTone(testResult.status)}>
                                {testResult.status === 'completed' ? 'Completed' : testResult.status === 'failed' ? 'Failed' : 'Running'}
                            </Chip>
                        </div>

                        {/* Execution Path */}
                        <div>
                            <h4 className="text-sm font-semibold mb-2">Execution Path</h4>
                            <div className="bg-muted rounded-lg p-3">
                                <div className="flex flex-wrap gap-2">
                                    {testResult.executionPath?.map(
                                        (nodeId: string) => (
                                            <Chip key={nodeId} tone="gray">
                                                {nodeId}
                                            </Chip>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Variables */}
                        {testResult.variables &&
                            Object.keys(testResult.variables).length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold mb-2">Final Variables</h4>
                                    <div className="bg-muted rounded-lg p-3">
                                        <pre className="text-xs overflow-x-auto">
                                            {JSON.stringify(testResult.variables, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            )}

                        {/* Steps */}
                        <div>
                            <h4 className="text-sm font-semibold mb-2">
                                Steps ({testResult.steps?.length || 0})
                            </h4>
                            <div className="space-y-2">
                                {testResult.steps?.map((step: TestResultStep) => (
                                    <div
                                        key={step.nodeName as string}
                                        className="bg-muted rounded-lg p-3 text-sm"
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium">{step.nodeName}</span>
                                            <Chip tone={step.status === 'success' ? 'ok' : 'danger'}>
                                                {step.status}
                                            </Chip>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            Duration: {step.duration}ms
                                        </div>
                                        {step.output ? (
                                            <div className="mt-2 text-xs">
                                                <pre className="overflow-x-auto">
                                                    {JSON.stringify(step.output, null, 2)}
                                                </pre>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Full Response */}
                        <div>
                            <h4 className="text-sm font-semibold mb-2">Full Response</h4>
                            <div className="bg-muted rounded-lg p-3">
                                <pre className="text-xs overflow-x-auto max-h-64">
                                    {JSON.stringify(testResult, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
}
