// Neon can drop or refuse a connection for a moment (waking from suspend, a network blip).
//
// Only *opening* a connection is retried: nothing has reached the database yet, so a retry can
// never save something twice. A connection lost in the middle of a query is not retried; the
// write may already have happened, so that one goes back to the user as a "try again".

const RETRY_DELAYS_MS = [1_000, 2_000];

// The server answered and said no (wrong password, missing database): trying again won't help.
// Postgres reports those with a five-character SQLSTATE; network failures have none, or an
// E-prefixed code such as ETIMEDOUT. 57P03 is "starting up", which is worth waiting for.
const isRefusedForGood = (err: any) => /^[0-9A-Z]{5}$/.test(String(err?.code ?? "")) && err.code !== "57P03";

export const connectWithRetry = async <T>(connect: () => Promise<T>, delays: number[] = RETRY_DELAYS_MS, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await connect();
    } catch (err) {
      if (attempt >= delays.length || isRefusedForGood(err)) throw err;
      console.warn(`[Database] Connection failed (${(err as any)?.code ?? (err as Error)?.message}); retrying.`);
      await wait(delays[attempt]);
    }
  }
};

// Failures that mean the database couldn't be reached, not that the request was wrong.
const DOWN = /can't reach database server|connection terminated|timeout exceeded when trying to connect|server has closed the connection|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH/i;
const DOWN_CODES = new Set(["P1001", "P1002", "P1017", "P2024"]);

export const isDatabaseDown = (err: any) => DOWN_CODES.has(err?.code) || DOWN.test(String(err?.message ?? ""));

export const DATABASE_DOWN_MESSAGE = "The database isn't responding right now. Please wait a moment and try again.";
