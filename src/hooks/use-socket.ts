/**
 * React Hook for Socket.io Client
 *
 * Provides real-time WebSocket connection for workflow execution updates.
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface ExecutionStep {
  nodeId: string;
  nodeName?: string;
  status: string;
  duration?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
}

interface ExecutionRecord {
  _id: string;
  status: string;
  [key: string]: unknown;
}

interface ExecutionEvent {
  workflowId: string;
  executionId: string;
  execution?: ExecutionRecord;
  step?: ExecutionStep;
  status?: string;
  data?: Record<string, unknown>;
}

interface UseSocketOptions {
  autoConnect?: boolean;
}

export function useSocket(options: UseSocketOptions = {}) {
  const { autoConnect = true } = options;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [transport, setTransport] = useState('N/A');

  useEffect(() => {
    if (!autoConnect) return;

    const socketInstance = io({
      path: '/api/socket',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected:', socketInstance.id);
      setIsConnected(true);
      setTransport(socketInstance.io.engine.transport.name);

      socketInstance.io.engine.on('upgrade', (transport) => {
        setTransport(transport.name);
      });
    });

    socketInstance.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
      setIsConnected(false);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [autoConnect]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }
  }, [socket]);

  return {
    socket,
    isConnected,
    transport,
    disconnect,
  };
}

/**
 * Hook for subscribing to workflow execution updates
 */
export function useWorkflowExecutions(workflowId: string | null) {
  const { socket, isConnected } = useSocket();
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const listenersAttached = useRef(false);

  useEffect(() => {
    if (!socket || !isConnected || !workflowId) return;

    // Join workflow room
    socket.emit('join:workflow', workflowId);
    console.log(`[Socket] Joining workflow:${workflowId}`);

    // Set up listeners only once
    if (!listenersAttached.current) {
      // Listen for execution started
      socket.on('execution:started', (event: ExecutionEvent) => {
        console.log('[Socket] Execution started:', event);
        if (event.execution) {
          setExecutions((prev) => [event.execution as ExecutionRecord, ...prev]);
        }
      });

      // Listen for execution completed
      socket.on('execution:completed', (event: ExecutionEvent) => {
        console.log('[Socket] Execution completed:', event);
        setExecutions((prev) =>
          prev.map((exec): ExecutionRecord =>
            exec._id === event.executionId
              ? { ...exec, ...(event.execution ?? {}) }
              : exec
          )
        );
      });

      // Listen for execution failed
      socket.on('execution:failed', (event: ExecutionEvent) => {
        console.log('[Socket] Execution failed:', event);
        setExecutions((prev) =>
          prev.map((exec): ExecutionRecord =>
            exec._id === event.executionId
              ? { ...exec, ...(event.execution ?? {}) }
              : exec
          )
        );
      });

      // Listen for execution status updates
      socket.on('execution:status', (event: ExecutionEvent) => {
        console.log('[Socket] Execution status:', event);
        setExecutions((prev) =>
          prev.map((exec): ExecutionRecord =>
            exec._id === event.executionId
              ? { ...exec, ...(event.status !== undefined ? { status: event.status } : {}), ...(event.data ?? {}) }
              : exec
          )
        );
      });

      listenersAttached.current = true;
    }

    return () => {
      // Leave workflow room
      socket.emit('leave:workflow', workflowId);
      console.log(`[Socket] Leaving workflow:${workflowId}`);
    };
  }, [socket, isConnected, workflowId]);

  return {
    executions,
    isConnected,
  };
}

/**
 * Hook for subscribing to a specific execution's updates
 */
export function useExecutionUpdates(executionId: string | null) {
  const { socket, isConnected } = useSocket();
  const [execution, setExecution] = useState<ExecutionRecord | null>(null);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const listenersAttached = useRef(false);

  useEffect(() => {
    if (!socket || !isConnected || !executionId) return;

    // Join execution room
    socket.emit('join:execution', executionId);
    console.log(`[Socket] Joining execution:${executionId}`);

    // Set up listeners only once
    if (!listenersAttached.current) {
      // Listen for execution steps (node executions)
      socket.on('execution:step', (event: ExecutionEvent) => {
        console.log('[Socket] Execution step:', event);
        const step = event.step;
        if (step) {
          setSteps((prev) => {
            // Check if step already exists (update) or add new
            const existingIndex = prev.findIndex(
              (s) => s.nodeId === step.nodeId
            );
            if (existingIndex >= 0) {
              const newSteps = [...prev];
              newSteps[existingIndex] = step;
              return newSteps;
            }
            return [...prev, step];
          });
        }
      });

      // Listen for execution completed
      socket.on('execution:completed', (event: ExecutionEvent) => {
        console.log('[Socket] Execution completed:', event);
        setExecution((prev): ExecutionRecord | null => prev
          ? { ...prev, ...(event.execution ?? {}) }
          : event.execution ?? null
        );
      });

      // Listen for execution failed
      socket.on('execution:failed', (event: ExecutionEvent) => {
        console.log('[Socket] Execution failed:', event);
        setExecution((prev): ExecutionRecord | null => prev
          ? { ...prev, ...(event.execution ?? {}) }
          : event.execution ?? null
        );
      });

      // Listen for execution status updates
      socket.on('execution:status', (event: ExecutionEvent) => {
        console.log('[Socket] Execution status:', event);
        setExecution((prev): ExecutionRecord | null => prev
          ? { ...prev, ...(event.status !== undefined ? { status: event.status } : {}), ...(event.data ?? {}) }
          : null
        );
      });

      listenersAttached.current = true;
    }

    return () => {
      // Leave execution room
      socket.emit('leave:execution', executionId);
      console.log(`[Socket] Leaving execution:${executionId}`);
    };
  }, [socket, isConnected, executionId]);

  return {
    execution,
    steps,
    isConnected,
  };
}
