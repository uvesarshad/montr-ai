import { NextResponse } from 'next/server';

import { getSession as getAuthSession } from '@/lib/get-session';
import { streamCopilotResponse } from '@/ai/flows/copilot-agent-flow';
import { deriveMissionSummary, getMissionTitleFromPrompt } from '@/lib/agent/missions';
import { getSession } from '@/lib/agent/multi-agent';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import { checkWallClock, terminateMission } from '@/lib/agent/mission-budget';
import { resolveDefaultMissionMode } from '@/lib/agent/safety-defaults';
import { applyAiRateLimit } from '@/lib/ai/rate-limit';

export async function handleAgentChatRequest(req: Request) {
  let missionIdForError: string | null = null;
  let missionBrandIdForError = 'default-brand-id';

  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Per-user throttle on agent/copilot chat. Mission budgets cap a single
    // mission's spend; this caps the rate at which new turns can be started.
    const limited = await applyAiRateLimit(req, 'ai:agent-chat', session.user.id);
    if (limited) return limited;

    const { message, history = [], missionId } = await req.json();
    if (!message) {
      return new NextResponse('Message is required', { status: 400 });
    }
    const userId = session.user.id;
    const brandId = req.headers.get('x-brand-id') || 'default-brand-id';
    const sessionState = await getSession(userId, brandId);

    missionBrandIdForError = brandId;

    let mission = missionId
      ? await agentMissionRepository.findById(missionId, userId)
      : null;

    if (!mission) {
      mission = await agentMissionRepository.create({
        userId,
        brandId,
        title: getMissionTitleFromPrompt(message),
        summary: deriveMissionSummary([
          ...history,
          { role: 'user', content: message },
        ]),
        status: 'active',
        // OSS safety (H6): supervised by default; permissive env restores 'mixed'.
        mode: resolveDefaultMissionMode(),
        currentSessionId: sessionState.sessionId,
      });
    } else {
      mission = await agentMissionRepository.update(mission.id, userId, {
        status: 'active',
        currentSessionId: sessionState.sessionId,
        lastActivityAt: new Date(),
        // A user message starts a fresh wall-clock session (Phase 1 long-horizon
        // semantics). Without this, resuming an old mission measured elapsed
        // time from createdAt and instantly terminated with wallclock_exceeded.
        sessionStartedAt: new Date(),
        terminatedReason: null,
      });
    }

    if (!mission) {
      throw new Error('Failed to resolve mission');
    }

    missionIdForError = mission.id;

    // Budget pre-check: refuse the turn if the mission is already terminated by budget
    // or has exceeded its wall-clock window.
    if (mission.status === 'blocked' && mission.terminatedReason) {
      return NextResponse.json(
        {
          error: 'Mission terminated',
          terminatedReason: mission.terminatedReason,
          missionId: mission.id,
        },
        { status: 409 },
      );
    }

    const wall = checkWallClock(mission);
    if (!wall.ok && wall.exceeded) {
      await terminateMission(
        { _id: mission.id, brandId, userId },
        mission.id,
        wall.exceeded,
        wall.message || 'Mission wall-clock budget exceeded',
      );
      return NextResponse.json(
        {
          error: 'Mission terminated',
          terminatedReason: wall.exceeded,
          missionId: mission.id,
        },
        { status: 409 },
      );
    }

    await agentMissionRepository.appendEvent({
      missionId: mission.id,
      brandId,
      userId,
      sessionId: sessionState.sessionId,
      type: 'message',
      role: 'user',
      content: message,
    });

    // Tool history injection now lives inside prepareMissionTurnContext so both
    // streaming and worker paths share the same continuity logic.
    const stream = await streamCopilotResponse({
      message,
      history,
      missionId: mission.id,
      userId,
      brandId,
    });

    const updatedSessionState = await getSession(userId, brandId);
    // Set active before streaming begins (session routing only — status may be overridden by tools)
    await agentMissionRepository.update(mission.id, userId, {
      activeAgentId: updatedSessionState.activeAgentId,
      currentSessionId: updatedSessionState.sessionId,
      lastActivityAt: new Date(),
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        let assistantResponse = '';

        try {
          for await (const chunk of stream) {
            assistantResponse += chunk;
            controller.enqueue(new TextEncoder().encode(chunk));
          }

          if (assistantResponse.trim().length > 0) {
            await agentMissionRepository.appendEvent({
              missionId: mission.id,
              brandId,
              userId,
              sessionId: updatedSessionState.sessionId,
              type: 'message',
              role: 'assistant',
              content: assistantResponse,
              metadata: {
                activeAgentId: updatedSessionState.activeAgentId,
              },
            });
          }

          // AU7: Post-stream status sync — re-fetch mission to preserve any terminal
          // status written by completeMission / reportBlocked tools during this turn.
          // Only reset to 'active' if the mission is still in a transient state.
          const currentMission = await agentMissionRepository.findById(mission.id, userId);
          const terminalStatuses = new Set(['completed', 'blocked', 'scheduled', 'waiting']);
          if (currentMission && !terminalStatuses.has(currentMission.status)) {
            await agentMissionRepository.update(mission.id, userId, {
              status: 'active',
              lastActivityAt: new Date(),
            });
          }

          // Auto-continue dispatch: if the mission is still active and running in
          // autonomous mode, hand off to the BullMQ worker so the next turn runs
          // server-side without requiring the user to send another message.
          if (currentMission && currentMission.mode === 'autonomous' && !terminalStatuses.has(currentMission.status)) {
            try {
              const { dispatchMissionContinuation } = await import('@/lib/queue/queue');
              await dispatchMissionContinuation({
                missionId: mission.id,
                userId,
                brandId,
                iteration: 0,
              }, 1500);
            } catch (dispatchError) {
              console.warn('[Agent] Failed to dispatch mission auto-continuation:', dispatchError);
            }
          }

          controller.close();
        } catch (error) {
          await agentMissionRepository.appendEvent({
            missionId: mission.id,
            brandId,
            userId,
            sessionId: updatedSessionState.sessionId,
            type: 'error',
            role: 'system',
            content: error instanceof Error ? error.message : 'Unknown streaming error',
            metadata: {
              activeAgentId: updatedSessionState.activeAgentId,
            },
          }).catch((appendError) => {
            console.error('Failed to append mission error event:', appendError);
          });
          controller.error(error);
        }
      },
    });

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'x-mission-id': mission.id,
        'x-agent-session-id': updatedSessionState.sessionId,
      },
    });
  } catch (error) {
    console.error('Error in Agent Chat Route:', error);

    if (missionIdForError) {
      const session = await getAuthSession().catch(() => null);
      const organizationId = session?.user?.id || session?.user?.id || '';
      const userId = session?.user?.id || '';

      if (organizationId && userId) {
        await agentMissionRepository.appendEvent({
          missionId: missionIdForError,
          brandId: missionBrandIdForError,
          userId,
          type: 'error',
          role: 'system',
          content: error instanceof Error ? error.message : 'Unknown agent chat error',
        }).catch((appendError) => {
          console.error('Failed to append mission route error event:', appendError);
        });
      }
    }

    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
