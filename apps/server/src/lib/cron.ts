import { generateTripsForDate } from "@/services/trip-generation.service";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
let lastDateGenerated: string | null = null;

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function tomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export function startCronJobs() {
  const run = async () => {
    const today = todayString();
    if (lastDateGenerated === today) return;
    lastDateGenerated = today;
    const target = tomorrowString();
    try {
      const result = await generateTripsForDate(target);
      console.log(`[Cron] Generated trips for ${target}: ${result.created} created, ${result.skipped} skipped`);
    } catch (err) {
      console.error(`[Cron] Failed to generate trips for ${target}:`, err);
    }
  };

  run();
  setInterval(run, CHECK_INTERVAL_MS);
  console.log(`[Cron] Started — checking every ${CHECK_INTERVAL_MS / 60000} minutes`);
}
