import type { DeliveryOutcome, NotificationEvent } from "@kaged/plugin-types";
import type { ValidatedConfig } from "./config.ts";
import { renderBody, renderTitle } from "./render.ts";

type Logger = {
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
};

type SendDeps = {
	fetchImpl?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
	logger?: Logger;
};

const PUSHOVER_API = "https://api.pushover.net/1/messages.json";

function buildClickUrl(baseUrl: string, deepLink: string): string {
	return new URL(deepLink, baseUrl).toString();
}

function parseRetryAfter(value: string | null): number | null {
	if (!value) {
		return null;
	}

	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.trunc(seconds * 1000);
	}

	const dateValue = Date.parse(value);
	if (Number.isNaN(dateValue)) {
		return null;
	}

	return Math.max(0, dateValue - Date.now());
}

export async function performSend(
	config: ValidatedConfig,
	event: NotificationEvent,
	deps: SendDeps = {},
): Promise<DeliveryOutcome> {
	const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
	const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
	const logger = deps.logger;
	const title = renderTitle(event);
	const message = renderBody(event);
	const priority =
		event.class === "attention.required" ? config.priority_attention : config.priority_completion;
	const sound =
		event.class === "attention.required" ? config.sound_attention : config.sound_completion;

	const body: Record<string, string | number> = {
		token: config.api_token,
		user: config.user_key,
		title,
		message,
		priority,
		sound,
	};

	if (config.click_base_url) {
		body.url = buildClickUrl(config.click_base_url, event.deep_link);
		body.url_title = "Open in kaged";
	}

	if (config.device) {
		body.device = config.device;
	}

	if (priority === 2) {
		body.retry = 60;
		body.expire = 600;
	}

	let lastTransient = "request failed";

	for (let attempt = 0; attempt <= config.retry_count; attempt += 1) {
		try {
			const response = await fetchImpl(PUSHOVER_API, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(config.timeout_ms),
			});

			if (response.ok) {
				let externalId: string | undefined;
				try {
					const parsed = (await response.json()) as Record<string, unknown>;
					externalId = typeof parsed.request === "string" ? parsed.request : undefined;
				} catch {
					externalId = undefined;
				}

				return { status: "delivered", external_id: externalId };
			}

			if (response.status >= 400 && response.status < 500 && response.status !== 429) {
				logger?.error("pushover client error", { status: response.status });
				return {
					status: "failed",
					reason: `client_error: ${response.status}`,
					retryable: false,
				};
			}

			lastTransient = `HTTP ${response.status}`;
			logger?.warn("pushover transient response", { status: response.status, attempt });

			if (attempt < config.retry_count) {
				const retryAfter =
					response.status === 429 ? parseRetryAfter(response.headers.get("Retry-After")) : null;
				await sleep(retryAfter ?? config.retry_delay_ms);
				continue;
			}
		} catch (error) {
			lastTransient = error instanceof Error ? error.message : String(error);
			logger?.warn("pushover request failed", { error: lastTransient, attempt });
			if (attempt < config.retry_count) {
				await sleep(config.retry_delay_ms);
				continue;
			}
		}

		break;
	}

	logger?.error("pushover delivery failed after retries", { reason: lastTransient });
	return {
		status: "failed",
		reason: `transient: ${lastTransient}`,
		retryable: true,
	};
}
