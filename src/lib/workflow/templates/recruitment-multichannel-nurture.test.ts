/**
 * Tests for the recruitment-flow template graph.
 *
 * Pure graph-shape checks — no DB. The seeder is exercised separately when
 * Mongo integration tests come online.
 */

import { describe, it, expect } from 'vitest';
import { buildRecruitmentTemplateGraph } from './recruitment-multichannel-nurture';

describe('buildRecruitmentTemplateGraph', () => {
  it('exposes a manual trigger', () => {
    const { trigger } = buildRecruitmentTemplateGraph();
    expect(trigger.type).toBe('manual');
  });

  it('contains all the expected canonical nodes', () => {
    const { nodes } = buildRecruitmentTemplateGraph();
    const subTypes = nodes.map(n => n.subType);
    expect(subTypes).toContain('manual');
    expect(subTypes).toContain('identity_resolve');
    expect(subTypes).toContain('make_outbound_call');
    expect(subTypes).toContain('branch');
    expect(subTypes).toContain('delay');
    expect(subTypes).toContain('send_whatsapp_template');
    expect(subTypes).toContain('wait_for_channel_response');
    expect(subTypes).toContain('send_marketing_email');
    expect(subTypes.filter(s => s === 'create_activity').length).toBe(2);
    expect(subTypes).toContain('end');
  });

  it('every node has a unique id', () => {
    const { nodes } = buildRecruitmentTemplateGraph();
    const ids = nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every edge references an existing node', () => {
    const { nodes, edges } = buildRecruitmentTemplateGraph();
    const ids = new Set(nodes.map(n => n.id));
    for (const e of edges) {
      expect(ids.has(e.source), `edge ${e.id} source ${e.source} exists`).toBe(true);
      expect(ids.has(e.target), `edge ${e.id} target ${e.target} exists`).toBe(true);
    }
  });

  it('has both branches off no-answer condition', () => {
    const { edges } = buildRecruitmentTemplateGraph();
    const fromBranch = edges.filter(e => e.source === 'branch_no_answer');
    const handles = new Set(fromBranch.map(e => e.sourceHandle));
    expect(handles.has('true')).toBe(true);
    expect(handles.has('false')).toBe(true);
  });

  it('terminates every branch at the end node', () => {
    const { edges } = buildRecruitmentTemplateGraph();
    const toEnd = edges.filter(e => e.target === 'end');
    // Three terminal paths: email_1 → end, activity_replied → end, activity_talked → end
    expect(toEnd.length).toBe(3);
  });
});
