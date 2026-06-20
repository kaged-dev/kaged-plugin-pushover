import type { NotificationChannel, SystemPlugin, SystemPluginContext } from "@kaged/plugin-types";
import { buildChannel } from "./channel.ts";
import { validateConfig } from "./config.ts";

const plugin = {
	name: "pushover",
	version: "0.1.0",
	description: "Hosted tier-3 notification channel (Pushover)",
	setup(ctx: SystemPluginContext) {
		const config = validateConfig(ctx.config, process.env, ctx.log);
		if (!config) {
			ctx.log.error("pushover plugin failed config validation");
			return;
		}

		const channel: NotificationChannel = buildChannel(config, ctx.log);
		ctx.on("notification.channel.register", (registrar) => {
			registrar.register(channel);
		});
	},
} satisfies SystemPlugin;

export default plugin;
