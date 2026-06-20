export interface PushoverConfig {
	user_key?: string;
	user_key_env?: string;
	api_token?: string;
	api_token_env?: string;
	priority_attention?: number;
	priority_completion?: number;
	sound_attention?: string;
	sound_completion?: string;
	click_base_url?: string;
	device?: string;
	timeout_ms?: number;
	retry_count?: number;
	retry_delay_ms?: number;
}

export interface ValidatedConfig {
	user_key: string;
	api_token: string;
	priority_attention: number;
	priority_completion: number;
	sound_attention: string;
	sound_completion: string;
	click_base_url?: string;
	device?: string;
	timeout_ms: number;
	retry_count: number;
	retry_delay_ms: number;
}

type ValidationLogger = {
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
};

function asObject(value: unknown): Record<string, unknown> {
	if (typeof value === "object" && value !== null) {
		return value as Record<string, unknown>;
	}

	return {};
}

function readOptionalString(source: Record<string, unknown>, key: string): string | undefined {
	const value = source[key];
	if (value === undefined) {
		return undefined;
	}

	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function clampNumber(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
	label: string,
	logger?: ValidationLogger,
): number {
	if (value === undefined) {
		return fallback;
	}

	if (typeof value !== "number" || !Number.isFinite(value)) {
		logger?.warn(`${label} must be a finite number; using default`, { value, fallback });
		return fallback;
	}

	const integer = Math.trunc(value);
	if (integer < min || integer > max) {
		const clamped = Math.min(max, Math.max(min, integer));
		logger?.warn(`${label} out of range; clamped`, { value: integer, clamped, min, max });
		return clamped;
	}

	return integer;
}

function normalizeUrl(raw: string, label: string, logger?: ValidationLogger): string | null {
	try {
		const url = new URL(raw);
		if (url.protocol !== "https:") {
			logger?.error(`${label} must use https`, { value: raw });
			return null;
		}

		return url.toString().replace(/\/$/, "");
	} catch {
		logger?.error(`${label} must be a valid URL`, { value: raw });
		return null;
	}
}

function resolveCredential(
	label: string,
	direct: string | undefined,
	envName: string | undefined,
	env: Record<string, string | undefined>,
	logger?: ValidationLogger,
): string | null {
	if (direct && envName) {
		logger?.error(`${label} and ${label}_env are mutually exclusive`);
		return null;
	}

	if (!direct && !envName) {
		logger?.error(`${label} or ${label}_env is required`);
		return null;
	}

	if (direct) {
		return direct;
	}

	const resolved = envName ? env[envName] : undefined;
	if (!resolved) {
		logger?.error(`${label}_env did not resolve`, { env_name: envName });
		return null;
	}

	return resolved;
}

export function mergeConfig(
	base: ValidatedConfig,
	override: Record<string, unknown>,
): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...base, ...override };

	if (Object.hasOwn(override, "user_key")) {
		delete merged.user_key_env;
	}

	if (Object.hasOwn(override, "user_key_env")) {
		delete merged.user_key;
	}

	if (Object.hasOwn(override, "api_token")) {
		delete merged.api_token_env;
	}

	if (Object.hasOwn(override, "api_token_env")) {
		delete merged.api_token;
	}

	return merged;
}

export function validateConfig(
	config: unknown,
	env: Record<string, string | undefined>,
	logger?: ValidationLogger,
): ValidatedConfig | null {
	const source = asObject(config);
	const userKey = resolveCredential(
		"user_key",
		readOptionalString(source, "user_key"),
		readOptionalString(source, "user_key_env"),
		env,
		logger,
	);
	if (!userKey) {
		return null;
	}

	const apiToken = resolveCredential(
		"api_token",
		readOptionalString(source, "api_token"),
		readOptionalString(source, "api_token_env"),
		env,
		logger,
	);
	if (!apiToken) {
		return null;
	}

	const clickBaseUrlRaw = readOptionalString(source, "click_base_url");
	const clickBaseUrl = clickBaseUrlRaw
		? (normalizeUrl(clickBaseUrlRaw, "click_base_url", logger) ?? undefined)
		: undefined;
	if (clickBaseUrlRaw && !clickBaseUrl) {
		return null;
	}

	return {
		user_key: userKey,
		api_token: apiToken,
		priority_attention: clampNumber(
			source.priority_attention,
			1,
			-2,
			2,
			"priority_attention",
			logger,
		),
		priority_completion: clampNumber(
			source.priority_completion,
			-1,
			-2,
			2,
			"priority_completion",
			logger,
		),
		sound_attention: readOptionalString(source, "sound_attention") ?? "siren",
		sound_completion: readOptionalString(source, "sound_completion") ?? "pushover",
		click_base_url: clickBaseUrl,
		device: readOptionalString(source, "device"),
		timeout_ms: clampNumber(source.timeout_ms, 5000, 1000, 30000, "timeout_ms", logger),
		retry_count: clampNumber(source.retry_count, 2, 0, 5, "retry_count", logger),
		retry_delay_ms: clampNumber(source.retry_delay_ms, 1000, 100, 10000, "retry_delay_ms", logger),
	};
}
