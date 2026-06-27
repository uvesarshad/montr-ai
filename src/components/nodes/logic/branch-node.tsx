'use client';

import React, { memo, useReducer, useCallback, useEffect } from 'react';
import { Position, NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';
import NodeShell from '../node-shell';
import NodeHandle from '../node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useNodeUtils } from '@/hooks/use-node-utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface BranchNodeData {
    condition?: string;
    operator?: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan' | 'isEmpty' | 'isNotEmpty';
    value?: string;
    isNaturalLanguage?: boolean;
    naturalLanguagePrompt?: string;
}

const OPERATORS = [
    { value: 'equals', label: 'Equals' },
    { value: 'notEquals', label: 'Not equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'greaterThan', label: 'Greater than' },
    { value: 'lessThan', label: 'Less than' },
    { value: 'isEmpty', label: 'Is empty' },
    { value: 'isNotEmpty', label: 'Is not empty' },
];

type BranchOperator = NonNullable<BranchNodeData['operator']>;

interface BranchState {
    condition: string;
    operator: BranchOperator;
    value: string;
    isNaturalLanguage: boolean;
    naturalLanguagePrompt: string;
}

type BranchAction =
    | { type: 'setCondition'; value: string }
    | { type: 'setOperator'; value: BranchOperator }
    | { type: 'setValue'; value: string }
    | { type: 'setIsNaturalLanguage'; value: boolean }
    | { type: 'setNaturalLanguagePrompt'; value: string };

function branchReducer(state: BranchState, action: BranchAction): BranchState {
    switch (action.type) {
        case 'setCondition':
            return { ...state, condition: action.value };
        case 'setOperator':
            return { ...state, operator: action.value };
        case 'setValue':
            return { ...state, value: action.value };
        case 'setIsNaturalLanguage':
            return { ...state, isNaturalLanguage: action.value };
        case 'setNaturalLanguagePrompt':
            return { ...state, naturalLanguagePrompt: action.value };
        default:
            return state;
    }
}

function BranchNode({ id, data, selected }: NodeProps<BranchNodeData>) {
    const { updateNodeData } = useNodeUtils(id);

    const [state, dispatch] = useReducer(branchReducer, undefined, () => ({
        condition: data.condition || '',
        operator: data.operator || 'equals',
        value: data.value || '',
        isNaturalLanguage: data.isNaturalLanguage || false,
        naturalLanguagePrompt: data.naturalLanguagePrompt || '',
    }));
    const { condition, operator, value, isNaturalLanguage, naturalLanguagePrompt } = state;

    useEffect(() => {
        updateNodeData({ condition, operator, value, isNaturalLanguage, naturalLanguagePrompt });
    }, [condition, operator, value, isNaturalLanguage, naturalLanguagePrompt, updateNodeData]);

    const handleDelete = useCallback(() => {
        // Will be handled by parent
    }, []);

    return (
        <NodeShell
            id={id}
            nodeType="logicBranch"
            selected={selected}
            title="Branch"
            icon={<GitBranch className="size-3.5" />}
            minWidth={280}
            minHeight={240}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-purple-100/50 dark:bg-purple-900/20 rounded-xl">
                    <GitBranch className="size-5 text-purple-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                            Branch (If/Else)
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Conditional routing
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-2 rounded-lg border bg-background/50">
                        <div className="space-y-0.5">
                            <Label className="text-xs flex items-center gap-1 cursor-pointer" htmlFor={`ai-toggle-${id}`}>
                                <GitBranch className="size-3 text-primary" /> Use AI
                            </Label>
                            <p className="text-[10px] text-muted-foreground mr-2">Evaluate using Natural Language</p>
                        </div>
                        <Switch
                            id={`ai-toggle-${id}`}
                            checked={isNaturalLanguage}
                            onCheckedChange={(checked) => dispatch({ type: 'setIsNaturalLanguage', value: checked })}
                        />
                    </div>

                    {isNaturalLanguage ? (
                        <div className="space-y-1">
                            <Label className="text-xs">Prompt <span className="text-[9px] font-normal text-muted-foreground">(Must answer yes/no)</span></Label>
                            <Textarea
                                value={naturalLanguagePrompt}
                                onChange={(e) => dispatch({ type: 'setNaturalLanguagePrompt', value: e.target.value })}
                                placeholder="e.g., Is the customer asking for a refund?"
                                className="h-20 min-h-[80px] rounded-xl text-xs resize-y"
                            />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label className="text-xs">If this value</Label>
                                <Input
                                    value={condition}
                                    onChange={(e) => dispatch({ type: 'setCondition', value: e.target.value })}
                                    placeholder="{{$trigger.value}} or variable"
                                    className="h-9 rounded-xl text-xs font-mono"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs">Operator</Label>
                                <Select value={operator} onValueChange={(v) => dispatch({ type: 'setOperator', value: v as BranchOperator })}>
                                    <SelectTrigger className="h-9 rounded-xl text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {OPERATORS.map((op) => (
                                            <SelectItem key={op.value} value={op.value}>
                                                {op.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {!['isEmpty', 'isNotEmpty'].includes(operator) && (
                                <div className="space-y-1">
                                    <Label className="text-xs">Value</Label>
                                    <Input
                                        value={value}
                                        onChange={(e) => dispatch({ type: 'setValue', value: e.target.value })}
                                        placeholder="Compare to..."
                                        className="h-9 rounded-xl text-xs"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Output labels */}
                <div className="flex justify-between text-[10px] font-medium px-1">
                    <span className="text-green-600">✓ TRUE</span>
                    <span className="text-red-500">✗ FALSE</span>
                </div>
            </div>

            {/* Input handle */}
            <NodeHandle
                type="target"
                position={Position.Left}
                nodeType="logicBranch"
            />

            {/* TRUE output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                id="true"
                style={{ top: '40%' }}
                tone="success"
            />

            {/* FALSE output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                id="false"
                style={{ top: '60%' }}
                tone="danger"
            />
        </NodeShell>
    );
}

export default memo(BranchNode);
