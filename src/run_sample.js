require('dotenv').config();

const { runWorkflow } = require('./workflow_runner');

async function main() {
  const result = await runWorkflow({
    userKey: 'sample_user',
    workflowKey: 'sample_extract_multiple',
    runtime: {
      keyword: 'Playwright テスト',
      slowMo: 500
    }
  });

  console.log(JSON.stringify(result, null, 2));
}

main();