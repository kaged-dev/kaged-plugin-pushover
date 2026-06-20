import type {
	ChannelContext,
	DeliveryOutcome,
	NotificationChannel,
	NotificationEvent,
} from "@kaged/plugin-types";
import type { ValidatedConfig } from "./config.ts";
import { mergeConfig, validateConfig } from "./config.ts";
import { performSend } from "./send.ts";

type Logger = {
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
};

export function buildChannel(config: ValidatedConfig, logger?: Logger): NotificationChannel {
	return {
		id: "pushover",
		label: "Pushover",
		async send(event: NotificationEvent, context: ChannelContext): Promise<DeliveryOutcome> {
			try {
				const merged = validateConfig(mergeConfig(config, context.config), process.env);
				if (!merged) {
					logger?.error("pushover routing config is invalid");
					return {
						status: "failed",
						reason: "invalid_config: pushover routing config failed validation",
						retryable: false,
					};
				}

				return await performSend(merged, event, { logger });
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				logger?.error("pushover send failed before dispatch", { reason });
				return {
					status: "failed",
					reason: `render_error: ${reason}`,
					retryable: false,
				};
			}
		},
	};
}
