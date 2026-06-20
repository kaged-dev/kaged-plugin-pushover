import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { NotificationEvent } from "@kaged/plugin-types";
import type { ValidatedConfig } from "../src/config.ts";
import { performSend } from "../src/send.ts";

const ORIGINAL_FETCH = globalThis.fetch;

const BASE_CONFIG: ValidatedConfig = {
	user_key: "user-1",
	api_token: "api-1",
	priority_attention: 1,
	priority_completion: -1,
	sound_attention: "siren",
	sound_completion: "pushover",
	timeout_ms: 5000,
	retry_count: 2,
	retry_delay_ms: 10,
};

const ATTENTION_EVENT: NotificationEvent = {
	id: "evt_1",
	class: "attention.required",
	session_id: "session-1",
	project_id: "project-1",
	run_id: "run-1",
	summary: "Need operator",
	deep_link: "/projects/project-1/sessions/session-1?attention=ask",
	emitted_at: 1,
	attention_kind: "ask",
};

beforeEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
});

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
});

describe("performSend", () => {
	test("returns delivered outcome on 200 with external id", async () => {
		const fetchMock = mock(async (input: string | URL | Request, init?: RequestInit) => {
			expect(String(input)).toBe("https://api.pushover.net/1/messages.json");
			expect(init?.method).toBe("POST");
			const parsed = JSON.parse(String(init?.body)) as Record<string, unknown>;
			expect(parsed.user).toBe("user-1");
			expect(parsed.token).toBe("api-1");
			expect(parsed.priority).toBe(1);
			expect(parsed.sound).toBe("siren");
			return Response.json({ status: 1, request: "req_123" }, { status: 200 });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await performSend(BASE_CONFIG, ATTENTION_EVENT);
		expect(result).toEqual({
			status: "delivered",
			external_id: "req_123",
		});
	});

	test("returns non-retryable failure for 4xx without retry", async () => {
		const fetchMock = mock(async () => new Response("bad", { status: 401 }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await performSend(BASE_CONFIG, ATTENTION_EVENT);
		expect(result).toEqual({
			status: "failed",
			reason: "client_error: 401",
			retryable: false,
		});
		expect(fetchMock.mock.calls).toHaveLength(1);
	});

	test("retries on 429 and respects Retry-After", async () => {
		const delays: number[] = [];
		let attempts = 0;
		const fetchMock = mock(async () => {
			attempts += 1;
			if (attempts === 1) {
				return new Response("slow down", { status: 429, headers: { "Retry-After": "0.05" } });
			}

			return Response.json({ status: 1, request: "req_429" }, { status: 200 });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await performSend(BASE_CONFIG, ATTENTION_EVENT, {
			sleep: async (ms) => {
				delays.push(ms);
			},
		});

		expect(result).toEqual({ status: "delivered", external_id: "req_429" });
		expect(fetchMock.mock.calls).toHaveLength(2);
		expect(delays).toEqual([50]);
	});

	test("retries on 5xx", async () => {
		let attempts = 0;
		const fetchMock = mock(async () => {
			attempts += 1;
			if (attempts === 1) {
				return new Response("oops", { status: 500 });
			}

			return Response.json({ status: 1, request: "req_500" }, { status: 200 });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await performSend(BASE_CONFIG, ATTENTION_EVENT, {
			sleep: async () => {},
		});

		expect(result).toEqual({ status: "delivered", external_id: "req_500" });
		expect(fetchMock.mock.calls).toHaveLength(2);
	});

	test("retries on network errors", async () => {
		let attempts = 0;
		const fetchMock = mock(async () => {
			attempts += 1;
			if (attempts === 1) {
				throw new Error("socket hang up");
			}

			return Response.json({ status: 1, request: "req_net" }, { status: 200 });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await performSend(BASE_CONFIG, ATTENTION_EVENT, {
			sleep: async () => {},
		});

		expect(result).toEqual({ status: "delivered", external_id: "req_net" });
		expect(fetchMock.mock.calls).toHaveLength(2);
	});

	test("returns retryable transient failure after retries exhausted", async () => {
		const fetchMock = mock(async () => {
			throw new Error("network down");
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await performSend({ ...BASE_CONFIG, retry_count: 1 }, ATTENTION_EVENT, {
			sleep: async () => {},
		});
		expect(result).toEqual({
			status: "failed",
			reason: "transient: network down",
			retryable: true,
		});
		expect(fetchMock.mock.calls).toHaveLength(2);
	});

	test("includes emergency retry and expire for priority 2", async () => {
		const fetchMock = mock(async (_input: string | URL | Request, init?: RequestInit) => {
			const parsed = JSON.parse(String(init?.body)) as Record<string, unknown>;
			expect(parsed.priority).toBe(2);
			expect(parsed.retry).toBe(60);
			expect(parsed.expire).toBe(600);
			return Response.json({ status: 1, request: "req_emergency" }, { status: 200 });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await performSend({ ...BASE_CONFIG, priority_attention: 2 }, ATTENTION_EVENT);
	});
});
