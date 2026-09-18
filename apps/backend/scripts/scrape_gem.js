const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Register ts-node to execute TypeScript backend service files directly
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: "commonjs"
  }
});

const { runLiveScraper } = require('../src/services/scraperService');

async function run() {
  console.log('Triggering live crawler via standalone CLI runner...');
  try {
    const result = await runLiveScraper();
    console.log(`Standalone scraping completed! Success: ${result.success}, Count: ${result.count}`);
    process.exit(0);
  } catch (error) {
    console.error('Standalone scraping execution failed:', error);
    process.exit(1);
  }
}

run();
