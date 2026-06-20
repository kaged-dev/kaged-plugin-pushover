import { afterEach, describe, expect, test } from "bun:test";
import { validateConfig } from "../src/config.ts";

function createLogger() {
	const warnings: string[] = [];
	const errors: string[] = [];

	return {
		logger: {
			warn(message: string) {
				warnings.push(message);
			},
			error(message: string) {
				errors.push(message);
			},
		},
		warnings,
		errors,
	};
}

afterEach(() => {
	delete process.env.PUSHOVER_USER_KEY;
	delete process.env.PUSHOVER_API_TOKEN;
	delete process.env.OTHER_USER;
	delete process.env.OTHER_TOKEN;
});

describe("validateConfig", () => {
	test("accepts env-based config", () => {
		process.env.PUSHOVER_USER_KEY = "user-1";
		process.env.PUSHOVER_API_TOKEN = "api-1";

		const result = validateConfig(
			{
				user_key_env: "PUSHOVER_USER_KEY",
				api_token_env: "PUSHOVER_API_TOKEN",
				click_base_url: "https://kaged.example.com/",
			},
			process.env,
		);

		expect(result).toEqual({
			user_key: "user-1",
			api_token: "api-1",
			priority_attention: 1,
			priority_completion: -1,
			sound_attention: "siren",
			sound_completion: "pushover",
			click_base_url: "https://kaged.example.com",
			device: undefined,
			timeout_ms: 5000,
			retry_count: 2,
			retry_delay_ms: 1000,
		});
	});

	test("rejects both user key sources", () => {
		expect(
			validateConfig({ user_key: "u", user_key_env: "X", api_token: "a" }, process.env),
		).toBeNull();
	});

	test("rejects neither user key source", () => {
		expect(validateConfig({ api_token: "a" }, process.env)).toBeNull();
	});

	test("rejects both api token sources", () => {
		expect(
			validateConfig({ user_key: "u", api_token: "a", api_token_env: "X" }, process.env),
		).toBeNull();
	});

	test("rejects neither api token source", () => {
		expect(validateConfig({ user_key: "u" }, process.env)).toBeNull();
	});

	test("rejects unresolved user key env", () => {
		expect(
			validateConfig({ user_key_env: "PUSHOVER_USER_KEY", api_token: "a" }, process.env),
		).toBeNull();
	});

	test("rejects unresolved api token env", () => {
		expect(
			validateConfig({ user_key: "u", api_token_env: "PUSHOVER_API_TOKEN" }, process.env),
		).toBeNull();
	});

	test("clamps priorities with warnings", () => {
		const { logger, warnings } = createLogger();
		const result = validateConfig(
			{
				user_key: "u",
				api_token: "a",
				priority_attention: 9,
				priority_completion: -9,
			},
			process.env,
			logger,
		);

		expect(result?.priority_attention).toBe(2);
		expect(result?.priority_completion).toBe(-2);
		expect(warnings).toHaveLength(2);
	});

	test("clamps timeout and retry values with warnings", () => {
		const { logger, warnings } = createLogger();
		const result = validateConfig(
			{
				user_key: "u",
				api_token: "a",
				timeout_ms: 10,
				retry_count: 10,
				retry_delay_ms: 50_000,
			},
			process.env,
			logger,
		);

		expect(result?.timeout_ms).toBe(1000);
		expect(result?.retry_count).toBe(5);
		expect(result?.retry_delay_ms).toBe(10000);
		expect(warnings).toHaveLength(3);
	});
});
