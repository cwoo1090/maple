import posthog from "posthog-js";
import type { CaptureResult, Properties } from "posthog-js";

type AnalyticsProperties = Record<string, boolean | number | string | string[] | null | undefined>;

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";
const posthogReplayEnabled = import.meta.env.VITE_POSTHOG_REPLAY_ENABLED !== "false";
const posthogFullReplay = import.meta.env.VITE_POSTHOG_FULL_REPLAY !== "false";
const posthogReplaySampleRate = readSampleRate(import.meta.env.VITE_POSTHOG_REPLAY_SAMPLE_RATE);
const redactedPropertyNames = new Set([
  "$city_name",
  "$current_url",
  "$host",
  "$initial_current_url",
  "$initial_host",
  "$initial_pathname",
  "$initial_referrer",
  "$initial_referring_domain",
  "$initial_url",
  "$pathname",
  "$raw_user_agent",
  "$referrer",
  "$referring_domain",
  "$useragent",
]);
const redactedPropertyPrefixes = [
  "$geoip_city",
  "$geoip_latitude",
  "$geoip_longitude",
  "$geoip_postal",
  "$initial_geoip_city",
  "$initial_geoip_latitude",
  "$initial_geoip_longitude",
  "$initial_geoip_postal",
];

let initialized = false;
let analyticsContext: AnalyticsProperties = {};

function readSampleRate(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 0), 1);
}

function hasAnalyticsConfig() {
  return Boolean(posthogKey && posthogHost);
}

function redactProperties(properties: Properties | undefined): Properties {
  if (!properties) return {};
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key]) =>
        !redactedPropertyNames.has(key) &&
        key !== "$geoip_disable" &&
        !redactedPropertyPrefixes.some((prefix) => key.startsWith(prefix)),
    ),
  );
}

function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null;
  event.properties = redactProperties(event.properties);
  event.$set = redactProperties(event.$set);
  event.$set_once = redactProperties(event.$set_once);
  return event;
}

function clientDeviceProperties(): AnalyticsProperties {
  if (typeof window === "undefined") return {};
  const screenWidth = window.screen?.width ?? null;
  const screenHeight = window.screen?.height ?? null;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;

  return {
    screen_width: screenWidth,
    screen_height: screenHeight,
    screen_size: screenWidth && screenHeight ? `${screenWidth}x${screenHeight}` : null,
    timezone,
  };
}

function initializePostHog() {
  if (initialized || !hasAnalyticsConfig()) return;

  posthog.init(posthogKey, {
    api_host: posthogHost,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    disable_session_recording: !posthogReplayEnabled,
    enable_recording_console_log: false,
    capture_performance: false,
    session_recording: {
      sampleRate: posthogReplaySampleRate,
      maskAllInputs: !posthogFullReplay,
      maskTextSelector: posthogFullReplay ? null : undefined,
      maskInputOptions: posthogFullReplay
        ? {
            color: false,
            date: false,
            "datetime-local": false,
            email: false,
            month: false,
            number: false,
            range: false,
            search: false,
            select: false,
            tel: false,
            text: false,
            time: false,
            url: false,
            week: false,
            textarea: false,
            password: false,
          }
        : undefined,
      recordHeaders: false,
      recordBody: false,
    },
    disable_surveys: true,
    opt_out_capturing_by_default: false,
    person_profiles: "never",
    persistence: "localStorage",
    advanced_disable_flags: false,
    advanced_disable_feature_flags_on_first_load: true,
    before_send: beforeSend,
    property_denylist: Array.from(redactedPropertyNames),
  });

  initialized = true;
  posthog.opt_in_capturing();
  if (posthogReplayEnabled) {
    posthog.startSessionRecording(true);
  }
}

export function setAnalyticsContext(properties: AnalyticsProperties) {
  analyticsContext = {
    ...analyticsContext,
    ...properties,
  };
}

export function track(event: string, properties: AnalyticsProperties = {}) {
  initializePostHog();
  if (!initialized || posthog.has_opted_out_capturing()) return;

  posthog.capture(event, {
    app: "maple",
    platform: "macos",
    ...clientDeviceProperties(),
    ...analyticsContext,
    ...properties,
    $process_person_profile: false,
  });
}
