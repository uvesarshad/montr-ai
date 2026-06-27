import { CoreMessage } from 'ai';

export const DEFAULT_MISSION_TITLE = 'New mission';
const MAX_TITLE_WORDS = 9;
const MAX_SUMMARY_LENGTH = 180;

type MissionMessage = Pick<CoreMessage, 'role' | 'content'>;

function normalizeMessageContent(content: CoreMessage['content']) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => ('text' in part ? String(part.text ?? '') : ''))
      .join(' ')
      .trim();
  }

  return '';
}

function trimText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export function getMissionTitleFromPrompt(prompt: string) {
  const cleanedPrompt = prompt
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim();

  if (!cleanedPrompt) {
    return DEFAULT_MISSION_TITLE;
  }

  return cleanedPrompt.split(' ').slice(0, MAX_TITLE_WORDS).join(' ');
}

export function deriveMissionSummary(messages: MissionMessage[]) {
  const latestAssistant = messages
    .slice()
    .reverse()
    .find((message) => message.role === 'assistant');

  const latestUser = messages
    .slice()
    .reverse()
    .find((message) => message.role === 'user');

  const summarySource = latestAssistant ?? latestUser;
  const summary = summarySource ? normalizeMessageContent(summarySource.content) : '';

  return summary ? trimText(summary, MAX_SUMMARY_LENGTH) : 'Mission ready to begin.';
}

export function trimMissionMessages(messages: CoreMessage[], maxMessages: number) {
  if (maxMessages <= 0) {
    return [];
  }

  if (messages.length <= maxMessages) {
    return messages;
  }

  return messages.slice(-maxMessages);
}
