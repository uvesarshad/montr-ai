'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { UserPlus, X, Check } from 'lucide-react';
import { Button, Chip, Select } from '@/components/ui-kit';

interface Agent {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  image?: string;
  role: string;
  isAdmin: boolean;
  isAgent: boolean;
}

interface ConversationAgentAssignmentProps {
  conversationId: string;
  currentAgentId?: string | null;
  currentAgentName?: string;
  onAssignmentChange?: (agentId: string, agentName: string) => void;
  disabled?: boolean;
}

export function ConversationAgentAssignment({
  conversationId,
  currentAgentId,
  currentAgentName: _currentAgentName,
  onAssignmentChange,
  disabled = false,
}: ConversationAgentAssignmentProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(currentAgentId || '');
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Fetch agents
  const fetchAgents = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/whatsapp/team/agents');
      const data = await response.json();

      if (response.ok) {
        setAgents(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast.error('Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isDialogOpen) {
      fetchAgents();
    }
  }, [isDialogOpen]);

  // Handle assignment
  const handleAssign = async () => {
    if (!selectedAgentId) {
      toast.error('Please select an agent');
      return;
    }

    setAssigning(true);
    try {
      const response = await fetch(`/api/whatsapp/conversations/${conversationId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId }),
      });

      const data = await response.json();

      if (response.ok) {
        const selectedAgent = agents.find((a) => a.id === selectedAgentId);
        toast.success('Conversation assigned successfully');
        setIsDialogOpen(false);

        if (onAssignmentChange && selectedAgent) {
          onAssignmentChange(selectedAgentId, selectedAgent.name);
        }
      } else {
        toast.error(data.error || 'Failed to assign conversation');
      }
    } catch (error) {
      toast.error('Error assigning conversation');
      console.error(error);
    } finally {
      setAssigning(false);
    }
  };

  const getAgentInitials = (agent: Agent) => {
    if (agent.firstName && agent.lastName) {
      return `${agent.firstName[0]}${agent.lastName[0]}`;
    }
    return agent.name.slice(0, 2).toUpperCase();
  };

  const currentAgent = agents.find((a) => a.id === currentAgentId);

  return (
    <>
      {/* Assignment Button */}
      <div className="flex items-center gap-2">
        {currentAgent ? (
          <div className="flex items-center gap-2 text-sm">
            <Avatar className="size-6">
              <AvatarImage src={currentAgent.image} alt={currentAgent.name} />
              <AvatarFallback className="text-xs">{getAgentInitials(currentAgent)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{currentAgent.name}</span>
            {currentAgent.isAdmin && (
              <Chip tone="gray">Admin</Chip>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Unassigned</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={currentAgent ? X : UserPlus}
          onClick={() => setIsDialogOpen(true)}
          disabled={disabled}
        >
          {currentAgent ? 'Reassign' : 'Assign'}
        </Button>
      </div>

      {/* Assignment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Conversation</DialogTitle>
            <DialogDescription>
              Select an agent to handle this conversation
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading agents...</div>
            ) : (
              <div className="space-y-3">
                <Select
                  value={selectedAgentId}
                  onChange={setSelectedAgentId}
                  placeholder="Choose an agent…"
                  options={agents.map((agent) => ({
                    value: agent.id,
                    label: agent.name,
                  }))}
                />

                {selectedAgentId && (() => {
                  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
                  if (!selectedAgent) return null;
                  return (
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="flex items-start gap-3">
                        <Avatar className="size-10">
                          <AvatarImage src={selectedAgent.image} alt={selectedAgent.name} />
                          <AvatarFallback>{getAgentInitials(selectedAgent)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{selectedAgent.name}</div>
                          {selectedAgent.email && (
                            <div className="text-xs text-muted-foreground">{selectedAgent.email}</div>
                          )}
                          <div className="mt-1.5">
                            <Chip tone="gray">{selectedAgent.isAdmin ? 'Admin' : 'Agent'}</Chip>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={assigning}>
              Cancel
            </Button>
            <Button icon={Check} onClick={handleAssign} disabled={!selectedAgentId || assigning}>
              {assigning ? 'Assigning…' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
