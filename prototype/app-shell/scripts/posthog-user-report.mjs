#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const appRoot = path.resolve(import.meta.dirname, "..");
const envPath = path.join(appRoot, ".env.posthog.local");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function usage() {
  console.error("Usage: node scripts/posthog-user-report.mjs <distinct_id> [lookback_hours]");
  console.error("Requires POSTHOG_HOST, POSTHOG_PROJECT_ID, POSTHOG_PERSONAL_API_KEY.");
}

function escapeHogqlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function rowsToObjects(response) {
  const columns = response.columns ?? [];
  return (response.results ?? []).map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index]])),
  );
}

async function queryHogql({ host, projectId, apiKey, query, name }) {
  const endpoint = new URL(`/api/projects/${projectId}/query/`, host);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query,
      },
      name,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PostHog query failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`PostHog query failed: ${data.error}`);
  }
  return rowsToObjects(data);
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "n/a";
  const total = Number(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!hours && !minutes) parts.push(`${remainingSeconds}s`);
  return parts.join(" ");
}

function truncate(value, maxLength = 180) {
  const text = value === null || value === undefined || value === "" ? "(none)" : String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

function printSummary(summary) {
  console.log("Summary");
  console.log(`  total_events: ${summary.total_events ?? 0}`);
  console.log(`  first_event: ${summary.first_event ?? "n/a"}`);
  console.log(`  last_event: ${summary.last_event ?? "n/a"}`);
  console.log(`  active_window: ${formatDuration(summary.active_window_seconds)}`);
  console.log(`  workspaces_created: ${summary.workspaces_created ?? 0}`);
  console.log(`  workspaces_opened: ${summary.workspaces_opened ?? 0}`);
  console.log(`  source_import_events: ${summary.source_import_events ?? 0}`);
  console.log(`  source_files_imported: ${summary.source_files_imported ?? 0}`);
  console.log(`  wiki_builds_started: ${summary.wiki_builds_started ?? 0}`);
  console.log(`  wiki_builds_completed_events: ${summary.wiki_builds_completed_events ?? 0}`);
  console.log(`  wiki_builds_success: ${summary.wiki_builds_success ?? 0}`);
  console.log(`  wiki_builds_non_success: ${summary.wiki_builds_non_success ?? 0}`);
  console.log(`  generated_files_reported: ${summary.generated_files_reported ?? 0}`);
  console.log(`  review_opened: ${summary.review_opened ?? 0}`);
  console.log(`  changes_accepted: ${summary.changes_accepted ?? 0}`);
  console.log(`  explore_questions_submitted: ${summary.explore_questions_submitted ?? 0}`);
  console.log(`  explore_questions_success: ${summary.explore_questions_success ?? 0}`);
  console.log(`  maintain_panel_opens: ${summary.maintain_panel_opens ?? 0}`);
  console.log(`  maintain_tasks_selected: ${summary.maintain_tasks_selected ?? 0}`);
  console.log(`  maintain_discussions_started: ${summary.maintain_discussions_started ?? 0}`);
  console.log(`  maintain_discussions_success: ${summary.maintain_discussions_success ?? 0}`);
  console.log(`  maintain_commands_started: ${summary.maintain_commands_started ?? 0}`);
  console.log(`  maintain_commands_success: ${summary.maintain_commands_success ?? 0}`);
}

function printEventCounts(rows) {
  console.log("\nEvent counts");
  for (const row of rows) {
    console.log(
      `  ${row.event}: ${row.count} (${row.first_seen ?? "n/a"} -> ${row.last_seen ?? "n/a"})`,
    );
  }
}

function printBuildTopics(rows) {
  console.log("\nWiki build topics");
  for (const row of rows) {
    console.log(`  [${row.count}x, ${row.topic_source}] ${truncate(row.wiki_topic)}`);
    console.log(`    ${row.first_seen ?? "n/a"} -> ${row.last_seen ?? "n/a"}`);
  }
}

function printBuildOutcomes(rows) {
  console.log("\nBuild outcomes");
  for (const row of rows) {
    console.log(
      `  ${row.timestamp}: result=${row.result ?? "n/a"}, error=${row.error_kind ?? "none"}, changed_files=${
        row.changed_file_count ?? 0
      }, source_count=${row.source_count ?? 0}, title=${truncate(row.wiki_title, 80)}`,
    );
  }
}

async function main() {
  loadEnvFile(envPath);

  const distinctId = process.argv[2];
  const lookbackHours = Number(process.argv[3] ?? 24);
  if (!distinctId || !Number.isFinite(lookbackHours) || lookbackHours <= 0) {
    usage();
    process.exit(1);
  }

  const host = process.env.POSTHOG_HOST;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!host || !projectId || !apiKey) {
    usage();
    process.exit(1);
  }

  const id = escapeHogqlString(distinctId);
  const hours = Math.floor(lookbackHours);
  const filter = `distinct_id = '${id}' AND timestamp >= now() - INTERVAL ${hours} HOUR`;
  const client = { host, projectId, apiKey };

  const [summaryRows, eventRows, topicRows, outcomeRows] = await Promise.all([
    queryHogql({
      ...client,
      name: "maple user summary",
      query: `
        SELECT
          count() AS total_events,
          min(timestamp) AS first_event,
          max(timestamp) AS last_event,
          dateDiff('second', min(timestamp), max(timestamp)) AS active_window_seconds,
          countIf(event = 'workspace created') AS workspaces_created,
          countIf(event = 'workspace opened') AS workspaces_opened,
          countIf(event = 'source import completed') AS source_import_events,
          sumIf(properties.source_count, event = 'source import completed') AS source_files_imported,
          countIf(event = 'wiki build started') AS wiki_builds_started,
          countIf(event = 'wiki build completed') AS wiki_builds_completed_events,
          countIf(event = 'wiki build completed' AND properties.result = 'success') AS wiki_builds_success,
          countIf(event = 'wiki build completed' AND properties.result != 'success') AS wiki_builds_non_success,
          sumIf(properties.changed_file_count, event = 'wiki build completed') AS generated_files_reported,
          countIf(event = 'review opened') AS review_opened,
          countIf(event = 'changes accepted') AS changes_accepted,
          countIf(event = 'explore question submitted') AS explore_questions_submitted,
          countIf(event = 'explore question completed' AND properties.result = 'success') AS explore_questions_success,
          countIf(event = 'right panel mode changed' AND properties.mode = 'maintain') AS maintain_panel_opens,
          countIf(event = 'maintain task selected') AS maintain_tasks_selected,
          countIf(event = 'maintain discussion started') AS maintain_discussions_started,
          countIf(event = 'maintain discussion completed' AND properties.result = 'success') AS maintain_discussions_success,
          countIf(event = 'maintain command started') AS maintain_commands_started,
          countIf(event = 'maintain command completed' AND properties.result = 'success') AS maintain_commands_success
        FROM events
        WHERE ${filter}
      `,
    }),
    queryHogql({
      ...client,
      name: "maple user event counts",
      query: `
        SELECT
          event,
          count() AS count,
          min(timestamp) AS first_seen,
          max(timestamp) AS last_seen
        FROM events
        WHERE ${filter}
        GROUP BY event
        ORDER BY count DESC
        LIMIT 50
      `,
    }),
    queryHogql({
      ...client,
      name: "maple user build topics",
      query: `
        SELECT
          properties.wiki_topic AS wiki_topic,
          properties.wiki_topic_source AS topic_source,
          count() AS count,
          min(timestamp) AS first_seen,
          max(timestamp) AS last_seen
        FROM events
        WHERE ${filter}
          AND event = 'wiki build started'
        GROUP BY wiki_topic, topic_source
        ORDER BY first_seen ASC
        LIMIT 20
      `,
    }),
    queryHogql({
      ...client,
      name: "maple user build outcomes",
      query: `
        SELECT
          timestamp,
          properties.result AS result,
          properties.error_kind AS error_kind,
          properties.wiki_title AS wiki_title,
          properties.changed_file_count AS changed_file_count,
          properties.source_count AS source_count
        FROM events
        WHERE ${filter}
          AND event = 'wiki build completed'
        ORDER BY timestamp ASC
        LIMIT 20
      `,
    }),
  ]);

  console.log(`PostHog user report`);
  console.log(`distinct_id: ${distinctId}`);
  console.log(`lookback_hours: ${hours}\n`);
  printSummary(summaryRows[0] ?? {});
  printEventCounts(eventRows);
  printBuildTopics(topicRows);
  printBuildOutcomes(outcomeRows);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
