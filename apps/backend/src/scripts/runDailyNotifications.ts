import { runDailyNotificationMatch } from '../services/notificationEngine';
import { pool } from '../utils/db';

async function main() {
  let exitCode = 0;
  console.log('--- Starting Daily Notification Matcher ---');
  try {
    const result = await runDailyNotificationMatch();
    console.log(`--- Notification run finished: ${result.notificationsCreated} notifications created, ${result.emailsSent} digest email(s) sent ---`);
  } catch (err: any) {
    console.error('Notification matcher encountered an error:', err);
    // Fail the run so GitHub Actions shows red instead of a silent green.
    exitCode = 1;
  } finally {
    await pool.end();
    process.exit(exitCode);
  }
}

void main();
