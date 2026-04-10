#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};

const PORT = Number(getArg('--port', process.env.PORT || '3310'));
const PROJECT = getArg('--project', 'demo-ao');
const REPO = getArg('--repo', 'nhahn318-maker/demo-ao');
const CWD = getArg('--cwd', process.cwd());
const POLL_INTERVAL_MS = Number(getArg('--poll-ms', process.env.AO_GRAPH_POLL_MS || '5000'));
const MAX_EVENTS = Number(getArg('--max-events', process.env.AO_GRAPH_MAX_EVENTS || '500'));
const SSE_HEARTBEAT_MS = Number(getArg('--sse-heartbeat-ms', process.env.AO_GRAPH_SSE_HEARTBEAT_MS || '15000'));
const ROLE_PROFILES_PATH = getArg('--role-profiles', process.env.AO_ROLE_PROFILES || '');
const AUTOPILOT_STATE_PATH = getArg('--autopilot-state', process.env.AO_AUTOPILOT_STATE_PATH || '');
const WATCHDOG_LOG_PATH = getArg('--watchdog-log', process.env.AO_WATCHDOG_LOG_PATH || '');

function run(cmd, cmdArgs, options = {}) {
  const out = spawnSync(cmd, cmdArgs, {
    encoding: 'utf8',
    cwd: options.cwd || CWD,
    env: { ...process.env, ...(options.env || {}) },
  });
  if (out.status !== 0) {
    return { ok: false, stdout: out.stdout || '', stderr: out.stderr || '' };
  }
  return { ok: true, stdout: out.stdout || '', stderr: out.stderr || '' };
}

const REPO_ROOT = (() => {
  const r = run('git', ['rev-parse', '--show-toplevel']);
  return r.ok ? r.stdout.trim() : CWD;
})();
const EFFECTIVE_AUTOPILOT_STATE_PATH = AUTOPILOT_STATE_PATH
  ? path.resolve(AUTOPILOT_STATE_PATH)
  : path.join(REPO_ROOT, '.ao-tools', 'autopilot.state.json');
const EFFECTIVE_WATCHDOG_LOG_PATH = WATCHDOG_LOG_PATH
  ? path.resolve(WATCHDOG_LOG_PATH)
  : path.join(REPO_ROOT, '.ao-tools', 'watchdog.log');

const DEFAULT_ROLE_PROFILES = {
  version: 1,
  roles: [
    { id: 'role:design-agent', aliases: ['role:design'], name: 'design-agent', skills: ['requirements-analysis', 'prd-writing', 'hld-framing', 'api-contract'], tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'] },
    { id: 'role:backend-writer', aliases: ['role:backend'], name: 'backend-writer', skills: ['domain-modeling', 'api-implementation', 'auth', 'backend-tests'], tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'] },
    { id: 'role:frontend-writer', aliases: ['role:frontend'], name: 'frontend-writer', skills: ['ui-architecture', 'state-management', 'api-integration', 'frontend-tests'], tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'] },
    { id: 'role:test-planner', aliases: ['role:test'], name: 'test-planner', skills: ['test-strategy', 'ci-gates', 'flake-debugging'], tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'] },
    { id: 'role:release-agent', aliases: ['role:release'], name: 'release-agent', skills: ['deployment-checklist', 'operations-docs', 'handover'], tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'] },
    { id: 'role:unknown', name: 'unknown', skills: ['general-engineering'], tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'] },
  ],
};

function toStringList(value) {
  return Array.isArray(value)
    ? value.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
}

function normalizeRoleId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.startsWith('role:') ? raw : `role:${raw}`;
}

function normalizeRoleProfiles(raw, source) {
  const roleItems = Array.isArray(raw && raw.roles) ? raw.roles : [];
  const roles = [];
  const aliasToId = {};

  for (const item of roleItems) {
    const id = normalizeRoleId(item && item.id);
    if (!id) continue;

    const role = {
      id,
      name: String((item && item.name) || id.replace(/^role:/, '')).trim() || id.replace(/^role:/, ''),
      description: String((item && item.description) || '').trim(),
      skills: toStringList(item && item.skills),
      tools: toStringList(item && item.tools),
      aliases: toStringList(item && item.aliases).map((x) => normalizeRoleId(x)).filter(Boolean),
    };

    if (!role.skills.length) role.skills = ['general-engineering'];
    if (!role.tools.length) role.tools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'];

    roles.push(role);
    aliasToId[role.id] = role.id;
    for (const alias of role.aliases) aliasToId[alias] = role.id;
  }

  if (!roles.find((x) => x.id === 'role:unknown')) {
    roles.push({
      id: 'role:unknown',
      name: 'unknown',
      description: 'Fallback role when no explicit specialization is available.',
      skills: ['general-engineering'],
      tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
      aliases: [],
    });
    aliasToId['role:unknown'] = 'role:unknown';
  }

  const byId = {};
  for (const role of roles) byId[role.id] = role;

  return { source, roles, byId, aliasToId };
}

function loadRoleProfiles(repoRoot, explicitPath) {
  const candidates = [];
  if (explicitPath) candidates.push(path.resolve(explicitPath));
  candidates.push(path.join(repoRoot, '.ao-tools', 'role-profiles.json'));
  candidates.push(path.join(process.env.HOME || '', '.ao', 'role-profiles.json'));

  for (const filePath of candidates) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
      return normalizeRoleProfiles(parsed, filePath);
    } catch {
      // ignore invalid file and keep searching fallback
    }
  }

  return normalizeRoleProfiles(DEFAULT_ROLE_PROFILES, 'builtin-default');
}

function readJsonSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function tailLines(filePath, maxLines = 120) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    const lines = txt.split(/\r?\n/).filter(Boolean);
    if (lines.length <= maxLines) return lines;
    return lines.slice(lines.length - maxLines);
  } catch {
    return [];
  }
}

function readWatchdogSummary(filePath) {
  const lines = tailLines(filePath, 200);
  if (!lines.length) {
    return {
      path: filePath,
      exists: false,
      restartCount: 0,
      restartEvents: [],
      recent: [],
    };
  }

  const restartEvents = [];
  for (const line of lines) {
    const m = line.match(/^\[([^\]]+)\]\s+(.*)$/);
    const at = m ? m[1] : null;
    const msg = m ? m[2] : line;
    if (/restarted .* session/i.test(msg)) {
      restartEvents.push({ at, message: msg });
    }
  }

  return {
    path: filePath,
    exists: true,
    restartCount: restartEvents.length,
    restartEvents,
    recent: lines.slice(Math.max(0, lines.length - 10)),
  };
}

function parseKVFile(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const obj = {};
  txt.split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      obj[k] = v;
    }
  });
  return obj;
}

function findProjectSessionRoot(projectId) {
  const home = process.env.HOME || '';
  const root = path.join(home, '.agent-orchestrator');
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => n.endsWith(`-${projectId}`));
  if (!dirs.length) return null;
  dirs.sort();
  return path.join(root, dirs[dirs.length - 1]);
}

function listSessions(projectId) {
  const base = findProjectSessionRoot(projectId);
  if (!base) return [];
  const sessionsDir = path.join(base, 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];
  return fs.readdirSync(sessionsDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.join(sessionsDir, d.name))
    .map((file) => {
      const kv = parseKVFile(file);
      return {
        name: path.basename(file),
        issue: kv.issue ? Number(kv.issue) : null,
        branch: kv.branch || '',
        status: kv.status || 'unknown',
        role: kv.role || 'worker',
        tmuxName: kv.tmuxName || '',
        createdAt: kv.createdAt || '',
        worktree: kv.worktree || '',
      };
    });
}

function getIssues(repo) {
  const res = run('gh', [
    'issue',
    'list',
    '--repo', repo,
    '--state', 'all',
    '--limit', '200',
    '--json', 'number,title,state,labels,body,url',
  ]);
  if (!res.ok) return { issues: [], error: res.stderr || res.stdout };
  try {
    const issues = JSON.parse(res.stdout);
    return { issues, error: null };
  } catch (e) {
    return { issues: [], error: String(e) };
  }
}

function getPrs(repo, state = 'open') {
  const res = run('gh', [
    'pr',
    'list',
    '--repo', repo,
    '--state', state,
    '--limit', '200',
    '--json', 'number,title,headRefName,url,state,updatedAt',
  ]);
  if (!res.ok) return [];
  try {
    return JSON.parse(res.stdout);
  } catch {
    return [];
  }
}

function parseDeps(body) {
  if (!body) return [];
  const m = body.match(/Depends on\s*:\s*([^\n]+)/i);
  if (!m) return [];
  const deps = [];
  const rx = /#(\d+)/g;
  let mm;
  while ((mm = rx.exec(m[1])) !== null) deps.push(Number(mm[1]));
  return [...new Set(deps)];
}

function issuePhase(issue) {
  const labels = (issue.labels || []).map((l) => l.name || l);
  const phase = labels.find((l) => /^phase:/i.test(l));
  if (phase) return phase;
  return 'phase:unclassified';
}

function issueRole(issue, roleProfiles) {
  const labels = (issue.labels || []).map((l) => l.name || l);
  const roleLabels = labels.filter((l) => /^role:/i.test(l));
  for (const label of roleLabels) {
    const canonical = roleProfiles.aliasToId[label] || label;
    if (roleProfiles.byId[canonical]) return canonical;
    if (/^role:/i.test(canonical)) return canonical;
  }
  return 'role:unknown';
}

function getWorkerSignals(sessions) {
  const out = {};
  for (const s of sessions.filter((x) => x.role !== 'orchestrator')) {
    const sig = {
      session: s.name,
      issue: s.issue,
      branch: s.branch,
      worktree: s.worktree,
      head: '',
      changedCount: 0,
      remoteHead: '',
      hasWorktree: false,
    };

    if (!sig.worktree || !fs.existsSync(sig.worktree)) {
      out[s.name] = sig;
      continue;
    }

    sig.hasWorktree = true;

    const localBranch = run('git', ['-C', sig.worktree, 'rev-parse', '--abbrev-ref', 'HEAD']);
    if (localBranch.ok) {
      const branchName = localBranch.stdout.trim();
      if (branchName && branchName !== 'HEAD') sig.branch = branchName;
    }

    const head = run('git', ['-C', sig.worktree, 'rev-parse', 'HEAD']);
    if (head.ok) sig.head = head.stdout.trim();

    const status = run('git', ['-C', sig.worktree, 'status', '--porcelain']);
    if (status.ok) {
      const lines = status.stdout.split(/\r?\n/).filter(Boolean);
      sig.changedCount = lines.length;
    }

    if (sig.branch) {
      const remote = run('git', ['-C', REPO_ROOT, 'ls-remote', '--heads', 'origin', sig.branch]);
      if (remote.ok) {
        const line = remote.stdout.split(/\r?\n/).find(Boolean) || '';
        sig.remoteHead = line ? line.split(/\s+/)[0] : '';
      }
    }

    out[s.name] = sig;
  }
  return out;
}

function buildState() {
  const { issues, error } = getIssues(REPO);
  const roleProfiles = loadRoleProfiles(REPO_ROOT, ROLE_PROFILES_PATH);
  const sessions = listSessions(PROJECT);
  const prsAll = getPrs(REPO, 'all');
  const openPrs = prsAll.filter((p) => String(p.state).toUpperCase() === 'OPEN');
  const workerSignals = getWorkerSignals(sessions);
  const autopilot = readJsonSafe(EFFECTIVE_AUTOPILOT_STATE_PATH);
  const watchdog = readWatchdogSummary(EFFECTIVE_WATCHDOG_LOG_PATH);

  const sessionByIssue = new Map();
  sessions
    .filter((s) => s.issue && s.role !== 'orchestrator' && s.status !== 'killed')
    .forEach((s) => sessionByIssue.set(s.issue, s));

  const items = issues.map((i) => ({
    number: i.number,
    title: i.title,
    state: i.state,
    url: i.url,
    phase: issuePhase(i),
    role: issueRole(i, roleProfiles),
    deps: parseDeps(i.body || ''),
    activeSession: sessionByIssue.get(i.number) || null,
  }));

  items.sort((a, b) => a.number - b.number);

  return {
    generatedAt: new Date().toISOString(),
    project: PROJECT,
    repo: REPO,
    repoRoot: REPO_ROOT,
    sessions,
    openPrs,
    prs: prsAll,
    issues: items,
    workerSignals,
    roleProfiles: roleProfiles.roles,
    roleProfilesSource: roleProfiles.source,
    autopilot,
    watchdog,
    error,
  };
}

function keyBy(arr, keyFn) {
  const out = {};
  for (const item of arr) out[keyFn(item)] = item;
  return out;
}

function buildSnapshot(state) {
  return {
    sessions: keyBy(state.sessions, (s) => s.name),
    issues: keyBy(state.issues, (i) => String(i.number)),
    prs: keyBy(state.prs, (p) => String(p.number)),
    workerSignals: state.workerSignals,
    autopilot: state.autopilot
      ? {
          runId: state.autopilot.runId || '',
          status: state.autopilot.status || 'unknown',
          updatedAt: state.autopilot.updatedAt || '',
          loop: Number(state.autopilot?.lastLoop?.loop || 0),
          counters: state.autopilot.counters || {},
          recentEvents: Array.isArray(state.autopilot.recentEvents) ? state.autopilot.recentEvents : [],
        }
      : null,
    watchdog: state.watchdog
      ? {
          restartCount: Number(state.watchdog.restartCount || 0),
          recent: Array.isArray(state.watchdog.recent) ? state.watchdog.recent : [],
        }
      : null,
  };
}

let eventSeq = 1;
let events = [];
let latestState = {
  generatedAt: new Date().toISOString(),
  project: PROJECT,
  repo: REPO,
  repoRoot: REPO_ROOT,
  sessions: [],
  openPrs: [],
  prs: [],
  issues: [],
  workerSignals: {},
  roleProfiles: [],
  roleProfilesSource: 'unknown',
  autopilot: null,
  watchdog: null,
  error: null,
  collector: {
    totalPolls: 0,
    totalErrors: 0,
    consecutiveErrors: 0,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
  },
};
let lastSnapshot = null;
const sseClients = new Set();
const pollStats = {
  totalPolls: 0,
  totalErrors: 0,
  consecutiveErrors: 0,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: null,
};
let lastCollectorWarning = null;
const seenAutopilotEventKeys = new Set();
const seenAutopilotEventQueue = [];
let lastWatchdogRestartCount = 0;

function rememberAutopilotEventKey(key) {
  if (!key || seenAutopilotEventKeys.has(key)) return false;
  seenAutopilotEventKeys.add(key);
  seenAutopilotEventQueue.push(key);
  if (seenAutopilotEventQueue.length > 2000) {
    const stale = seenAutopilotEventQueue.shift();
    if (stale) seenAutopilotEventKeys.delete(stale);
  }
  return true;
}

function pushEvent(type, payload = {}) {
  const event = {
    id: eventSeq++,
    at: new Date().toISOString(),
    type,
    ...payload,
  };
  events.push(event);
  if (events.length > MAX_EVENTS) events = events.slice(events.length - MAX_EVENTS);

  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of [...sseClients]) {
    try {
      res.write(frame);
    } catch {
      sseClients.delete(res);
    }
  }
  return event;
}

function formatIssue(i) {
  return `#${i.number} ${i.title}`;
}

function diffAndEmit(prev, curr) {
  if (!prev) {
    pushEvent('collector_started', {
      message: `Tracking ${PROJECT} (${REPO})`,
      project: PROJECT,
      repo: REPO,
    });

    for (const s of Object.values(curr.sessions)) {
      if (s.role === 'orchestrator') continue;
      pushEvent('session_detected', {
        session: s.name,
        issue: s.issue,
        branch: s.branch,
        status: s.status,
        message: `Detected session ${s.name} on ${s.branch || '-'}`,
      });
    }

    if (curr.autopilot) {
      pushEvent('autopilot_detected', {
        message: `Autopilot telemetry detected (run ${curr.autopilot.runId || 'unknown'})`,
        runId: curr.autopilot.runId || null,
        status: curr.autopilot.status || 'unknown',
      });
      const ordered = [...(curr.autopilot.recentEvents || [])].sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
      for (const evt of ordered) {
        const key = `${evt.runId || curr.autopilot.runId || 'run'}:${String(evt.seq || evt.at || JSON.stringify(evt))}`;
        if (!rememberAutopilotEventKey(key)) continue;
        pushEvent('autopilot_event', {
          at: evt.at || new Date().toISOString(),
          runId: evt.runId || curr.autopilot.runId || null,
          eventType: evt.type || 'event',
          issue: evt.issue || null,
          session: evt.session || null,
          loop: evt.loop || null,
          message: evt.message || `autopilot ${evt.type || 'event'}`,
        });
      }
    }
    lastWatchdogRestartCount = Number(curr.watchdog?.restartCount || 0);
    return;
  }

  const prevSessions = prev.sessions;
  const currSessions = curr.sessions;
  const sessionKeys = new Set([...Object.keys(prevSessions), ...Object.keys(currSessions)]);
  for (const k of sessionKeys) {
    const a = prevSessions[k];
    const b = currSessions[k];

    if (!a && b) {
      pushEvent('session_started', {
        session: b.name,
        issue: b.issue,
        branch: b.branch,
        status: b.status,
        message: `Session ${b.name} started (${b.branch || '-'})`,
      });
      continue;
    }
    if (a && !b) {
      pushEvent('session_stopped', {
        session: a.name,
        issue: a.issue,
        branch: a.branch,
        status: a.status,
        message: `Session ${a.name} stopped`,
      });
      continue;
    }
    if (a.status !== b.status) {
      pushEvent('session_status_changed', {
        session: b.name,
        issue: b.issue,
        branch: b.branch,
        from: a.status,
        to: b.status,
        message: `Session ${b.name}: ${a.status} -> ${b.status}`,
      });
    }
  }

  const prevIssues = prev.issues;
  const currIssues = curr.issues;
  const issueKeys = new Set([...Object.keys(prevIssues), ...Object.keys(currIssues)]);
  for (const k of issueKeys) {
    const a = prevIssues[k];
    const b = currIssues[k];
    if (!a || !b) continue;
    if (a.state !== b.state) {
      pushEvent('issue_state_changed', {
        issue: b.number,
        from: a.state,
        to: b.state,
        title: b.title,
        url: b.url,
        message: `${formatIssue(b)}: ${a.state} -> ${b.state}`,
      });
    }
  }

  const prevPrs = prev.prs;
  const currPrs = curr.prs;
  const prKeys = new Set([...Object.keys(prevPrs), ...Object.keys(currPrs)]);
  for (const k of prKeys) {
    const a = prevPrs[k];
    const b = currPrs[k];

    if (!a && b) {
      pushEvent('pr_opened', {
        pr: b.number,
        branch: b.headRefName,
        title: b.title,
        url: b.url,
        state: b.state,
        message: `PR #${b.number} opened on ${b.headRefName}`,
      });
      continue;
    }
    if (a && !b) continue;
    if (a.state !== b.state) {
      pushEvent('pr_state_changed', {
        pr: b.number,
        branch: b.headRefName,
        title: b.title,
        url: b.url,
        from: a.state,
        to: b.state,
        message: `PR #${b.number}: ${a.state} -> ${b.state}`,
      });
    }
  }

  const prevWs = prev.workerSignals || {};
  const currWs = curr.workerSignals || {};
  const wsKeys = new Set([...Object.keys(prevWs), ...Object.keys(currWs)]);

  for (const k of wsKeys) {
    const a = prevWs[k];
    const b = currWs[k];
    if (!a || !b) continue;

    if (a.head && b.head && a.head !== b.head) {
      pushEvent('commit_detected', {
        session: k,
        issue: b.issue,
        branch: b.branch,
        commit: b.head,
        message: `${k}: new commit ${b.head.slice(0, 8)} on ${b.branch}`,
      });
    }

    if (a.changedCount !== b.changedCount) {
      pushEvent('working_tree_changed', {
        session: k,
        issue: b.issue,
        branch: b.branch,
        changedCount: b.changedCount,
        message: `${k}: changed files ${a.changedCount} -> ${b.changedCount}`,
      });
    }

    if (a.remoteHead !== b.remoteHead && b.remoteHead) {
      pushEvent('branch_pushed', {
        session: k,
        issue: b.issue,
        branch: b.branch,
        remoteHead: b.remoteHead,
        message: `${k}: branch ${b.branch} pushed (${b.remoteHead.slice(0, 8)})`,
      });
    }
  }

  const prevAutopilot = prev.autopilot;
  const currAutopilot = curr.autopilot;
  if (!prevAutopilot && currAutopilot) {
    pushEvent('autopilot_detected', {
      message: `Autopilot telemetry detected (run ${currAutopilot.runId || 'unknown'})`,
      runId: currAutopilot.runId || null,
      status: currAutopilot.status || 'unknown',
    });
  }
  if (prevAutopilot && currAutopilot && prevAutopilot.status !== currAutopilot.status) {
    pushEvent('autopilot_status_changed', {
      from: prevAutopilot.status || 'unknown',
      to: currAutopilot.status || 'unknown',
      runId: currAutopilot.runId || null,
      message: `Autopilot status ${prevAutopilot.status || 'unknown'} -> ${currAutopilot.status || 'unknown'}`,
    });
  }
  if (currAutopilot && Number(currAutopilot.loop || 0) > Number(prevAutopilot?.loop || 0)) {
    const loop = Number(currAutopilot.loop || 0);
    const counters = currAutopilot.counters || {};
    pushEvent('autopilot_loop_advanced', {
      loop,
      runId: currAutopilot.runId || null,
      message: `Autopilot loop ${loop} | spawned=${Number(counters.spawnedTotal || 0)} healed=${Number(counters.healedTotal || 0)} gateFailures=${Number(counters.gateFailuresTotal || 0)}`,
    });
  }

  if (currAutopilot && Array.isArray(currAutopilot.recentEvents)) {
    const ordered = [...currAutopilot.recentEvents].sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
    for (const evt of ordered) {
      const key = `${evt.runId || currAutopilot.runId || 'run'}:${String(evt.seq || evt.at || JSON.stringify(evt))}`;
      if (!rememberAutopilotEventKey(key)) continue;
      pushEvent('autopilot_event', {
        at: evt.at || new Date().toISOString(),
        runId: evt.runId || currAutopilot.runId || null,
        eventType: evt.type || 'event',
        issue: evt.issue || null,
        session: evt.session || null,
        loop: evt.loop || null,
        message: evt.message || `autopilot ${evt.type || 'event'}`,
      });
    }
  }

  const currWatchdogCount = Number(curr.watchdog?.restartCount || 0);
  const prevWatchdogCount = Number(prev.watchdog?.restartCount || lastWatchdogRestartCount || 0);
  if (currWatchdogCount > prevWatchdogCount) {
    pushEvent('watchdog_restart', {
      count: currWatchdogCount,
      message: `Watchdog restarted service/session (${currWatchdogCount - prevWatchdogCount} new restart event(s)).`,
    });
  }
  lastWatchdogRestartCount = currWatchdogCount;
}

function pollOnce() {
  const state = buildState();
  if (state.error && state.error !== lastCollectorWarning) {
    pushEvent('collector_warning', {
      message: `Collector warning: ${state.error}`,
    });
  }
  if (!state.error) {
    lastCollectorWarning = null;
  } else {
    lastCollectorWarning = state.error;
  }
  state.collector = { ...pollStats };
  latestState = state;
  const snapshot = buildSnapshot(state);
  diffAndEmit(lastSnapshot, snapshot);
  lastSnapshot = snapshot;
}

function safePoll() {
  pollStats.totalPolls += 1;
  try {
    pollOnce();
    pollStats.lastSuccessAt = new Date().toISOString();
    pollStats.lastError = null;
    pollStats.consecutiveErrors = 0;
    latestState.collector = { ...pollStats };
  } catch (e) {
    const message = String(e && e.message ? e.message : e);
    pollStats.totalErrors += 1;
    pollStats.consecutiveErrors += 1;
    pollStats.lastError = message;
    pollStats.lastErrorAt = new Date().toISOString();
    latestState.collector = { ...pollStats };
    pushEvent('collector_error', {
      message: `Collector error: ${message}`,
    });
  }
}

function getEventsSince(sinceId) {
  if (!sinceId) return events;
  return events.filter((e) => e.id > sinceId);
}

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);

  if (u.pathname === '/api/state') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(latestState));
    return;
  }

  if (u.pathname === '/api/events') {
    const since = Number(u.searchParams.get('since') || '0');
    const data = getEventsSince(Number.isFinite(since) ? since : 0);
    const lastId = events.length ? events[events.length - 1].id : 0;
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ events: data, lastId }));
    return;
  }

  if (u.pathname === '/api/events/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write('retry: 3000\n\n');

    const since = Number(u.searchParams.get('since') || '0');
    const backlog = getEventsSince(Number.isFinite(since) ? since : 0).slice(-120);
    for (const evt of backlog) {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    }

    sseClients.add(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, SSE_HEARTBEAT_MS);
    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
    return;
  }

  if (u.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      project: PROJECT,
      repo: REPO,
      sseClients: sseClients.size,
      collector: pollStats,
      roleProfiles: Array.isArray(latestState.roleProfiles) ? latestState.roleProfiles.length : 0,
      roleProfilesSource: latestState.roleProfilesSource,
      autopilotStatePath: EFFECTIVE_AUTOPILOT_STATE_PATH,
      watchdogLogPath: EFFECTIVE_WATCHDOG_LOG_PATH,
      autopilotStatus: latestState.autopilot?.status || null,
      generatedAt: latestState.generatedAt,
    }));
    return;
  }

  if (u.pathname === '/' || u.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

safePoll();
setInterval(safePoll, POLL_INTERVAL_MS);

server.listen(PORT, '0.0.0.0', () => {
  const roleProfiles = loadRoleProfiles(REPO_ROOT, ROLE_PROFILES_PATH);
  process.stdout.write(`AO Graph dashboard: http://localhost:${PORT}\n`);
  process.stdout.write(`Project=${PROJECT} Repo=${REPO}\n`);
  process.stdout.write(`Role profiles=${roleProfiles.source} (${roleProfiles.roles.length} roles)\n`);
  process.stdout.write(`Autopilot state=${EFFECTIVE_AUTOPILOT_STATE_PATH}\n`);
  process.stdout.write(`Watchdog log=${EFFECTIVE_WATCHDOG_LOG_PATH}\n`);
  process.stdout.write(`Polling every ${POLL_INTERVAL_MS}ms, max events ${MAX_EVENTS}\n`);
});
