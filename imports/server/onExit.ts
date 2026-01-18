// biome-ignore-all lint/suspicious/noConsole: signal handlers should minimize dependencies

const exitHandlers: (() => void | Promise<void>)[] = [];

["SIGINT" as const, "SIGTERM" as const, "SIGHUP" as const].forEach((signal) => {
  process.once(signal, () => {
    // Log signal receipt for debugging unexpected shutdowns
    const timestamp = new Date().toISOString();
    const stack = new Error().stack;
    console.warn(`[${timestamp}] Received ${signal} - initiating shutdown`);
    console.warn(
      `[${timestamp}] Process info: pid=${process.pid}, ppid=${process.ppid}, uptime=${process.uptime().toFixed(0)}s`,
    );
    console.warn(
      `[${timestamp}] Memory: ${JSON.stringify(process.memoryUsage())}`,
    );
    console.warn(`[${timestamp}] Stack trace:\n${stack}`);
    (async () => {
      for (const handler of exitHandlers.splice(0)) {
        try {
          await handler();
        } catch (e) {
          console.warn(
            `ignoring error in onExit handler for signal ${signal}`,
            e,
          );
        }
      }
    })()
      .catch((error) => {
        console.warn(`ignored onExit error`, error);
      })
      .finally(() => {
        // We always want to reissue the signal once we've tried running all the exitHandlers
        process.kill(process.pid, signal);
      });
  });
});

export default function onExit(handler: () => void | Promise<void>) {
  exitHandlers.push(handler);
}
