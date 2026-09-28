import { runDailyNotificationMatch } from '../services/notificationEngine';
import { pool } from '../utils/db';

async function main() {
  console.log('--- Starting Daily Notification Matcher ---');
  try {
    const result = await runDailyNotificationMatch();
    console.log(`--- Notification run finished: ${result.notificationsCreated} notifications created, ${result.emailsSent} digest email(s) sent ---`);
  } catch (err: any) {
    console.error('Notification matcher encountered an error:', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

void main();
