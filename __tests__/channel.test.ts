import { describe, expect, mock, test } from "bun:test";
import type { ChannelContext, NotificationEvent } from "@kaged/plugin-types";
import { buildChannel } from "../src/channel.ts";
import type { ValidatedConfig } from "../src/config.ts";

const BASE_CONFIG: ValidatedConfig = {
	user_key: "user-1",
	api_token: "api-1",
	priority_attention: 1,
	priority_completion: -1,
	sound_attention: "siren",
	sound_completion: "pushover",
	timeout_ms: 5000,
	retry_count: 0,
	retry_delay_ms: 10,
};

const EVENT: NotificationEvent = {
	id: "evt_1",
	class: "attention.required",
	session_id: "session-1",
	project_id: "project-1",
	run_id: "run-1",
	summary: "Need operator",
	deep_link: "/projects/project-1/sessions/session-1?attention=checkpoint",
	emitted_at: 1,
	attention_kind: "checkpoint",
};

const CONTEXT: ChannelContext = {
	operatorId: "operator-1",
	config: {},
};

describe("buildChannel", () => {
	test("exposes stable metadata", () => {
		const channel = buildChannel(BASE_CONFIG);
		expect(channel.id).toBe("pushover");
		expect(channel.label).toBe("Pushover");
	});

	test("returns delivery outcome from send", async () => {
		const originalFetch = globalThis.fetch;
		const fetchMock = mock(async () =>
			Response.json({ status: 1, request: "req_1" }, { status: 200 }),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const channel = buildChannel(BASE_CONFIG);
		const result = await channel.send(EVENT, CONTEXT);
		expect(result).toEqual({
			status: "delivered",
			external_id: "req_1",
		});

		globalThis.fetch = originalFetch;
	});

	test("merges routing config over plugin config", async () => {
		const originalFetch = globalThis.fetch;
		const fetchMock = mock(async (_input: string | URL | Request, init?: RequestInit) => {
			const parsed = JSON.parse(String(init?.body)) as Record<string, unknown>;
			expect(parsed.user).toBe("override-user");
			return Response.json({ status: 1, request: "req_override" }, { status: 200 });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const channel = buildChannel(BASE_CONFIG);
		await channel.send(EVENT, { ...CONTEXT, config: { user_key: "override-user" } });

		globalThis.fetch = originalFetch;
	});

	test("does not throw on synchronous render errors", async () => {
		const channel = buildChannel(BASE_CONFIG);
		const invalidEvent = {
			...EVENT,
			summary: undefined,
		} as unknown as NotificationEvent;

		const result = await channel.send(invalidEvent, CONTEXT);
		expect(result).toEqual({
			status: "failed",
			reason: "render_error: notification event field summary must be a non-empty string",
			retryable: false,
		});
	});
});
