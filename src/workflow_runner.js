const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function resolveValue(valueFrom, context) {
  if (!valueFrom) return '';

  const parts = valueFrom.split('.');
  let current = context;

  for (const part of parts) {
    if (current == null || !(part in current)) {
      throw new Error(`値が見つかりません: ${valueFrom}`);
    }

    current = current[part];
  }

  return current;
}

function getLocator(page, step) {
  if (step.selectorType === 'xpath') {
    return page.locator(`xpath=${step.selector}`);
  }

  return page.locator(step.selector);
}

async function runWorkflow({
  userKey,
  workflowKey,
  runtime
}) {

  const userPath = path.join(
    __dirname,
    '..',
    'configs',
    'users',
    `${userKey}.json`
  );

  const workflowPath = path.join(
    __dirname,
    '..',
    'configs',
    'workflows',
    `${workflowKey}.json`
  );

  const user = loadJson(userPath);
  const workflow = loadJson(workflowPath);

  const headless = process.env.HEADLESS === 'true';

  const browser = await chromium.launch({
    headless,
    slowMo: runtime?.slowMo ?? 500
  });

  const page = await browser.newPage();

  const logs = [];
  const outputs = {};

  const runContext = {
    user,
    runtime: runtime || {},
    values: user.values || {}
  };

  try {

    logs.push(`開始: ${workflow.name}`);
    logs.push(`URLを開きます: ${workflow.startUrl}`);

    await page.goto(
      workflow.startUrl,
      {
        waitUntil: 'domcontentloaded'
      }
    );

    for (const step of workflow.steps) {

      logs.push(`実行: ${step.name} / ${step.type}`);

      if (step.type === 'input') {

        const locator = getLocator(page, step);

        const value = resolveValue(
          step.valueFrom,
          runContext
        );

        await locator.fill(value);
      }

      if (step.type === 'click') {

        const locator = getLocator(page, step);

        await locator.click();
      }

      if (step.type === 'press') {

        const locator = getLocator(page, step);

        await locator.press(step.key);
      }

      if (step.type === 'wait') {

        await page.waitForTimeout(
          step.milliseconds
        );
      }

      if (step.type === 'extractText') {

        const locator = getLocator(page, step);

        const texts =
          await locator.allTextContents();

        outputs[step.saveAs] = texts;

        logs.push(
          `取得: ${step.saveAs} = ${JSON.stringify(texts)}`
        );
      }

      if (step.type === 'extractAttribute') {

        const locator = getLocator(page, step);

        const values =
          await locator.evaluateAll(
            (elements, attributeName) => {
              return elements.map(
                element =>
                  element.getAttribute(attributeName)
              );
            },
            step.attribute
          );

        outputs[step.saveAs] = values;

        logs.push(
          `取得: ${step.saveAs} = ${JSON.stringify(values)}`
        );
      }

      if (step.type === 'screenshot') {

        const screenshotPath = path.join(
          __dirname,
          '..',
          'storage',
          'screenshots',
          step.fileName ||
            `screenshot_${Date.now()}.png`
        );

        await page.screenshot({
          path: screenshotPath,
          fullPage: true
        });

        logs.push(
          `スクリーンショット保存: ${screenshotPath}`
        );
      }
    }

    const resultPath = path.join(
      __dirname,
      '..',
      'storage',
      'results',
      `result_${Date.now()}.json`
    );

    fs.writeFileSync(
      resultPath,
      JSON.stringify(
        {
          workflowKey,
          userKey,
          executedAt:
            new Date().toISOString(),
          logs,
          outputs
        },
        null,
        2
      ),
      'utf-8'
    );

    logs.push(
      `結果JSON保存: ${resultPath}`
    );

    logs.push('完了');

    return {
      success: true,
      logs,
      outputs,
      resultPath
    };

  } catch (error) {

    const errorPath = path.join(
      __dirname,
      '..',
      'storage',
      'screenshots',
      `error_${Date.now()}.png`
    );

    try {

      await page.screenshot({
        path: errorPath,
        fullPage: true
      });

    } catch (_) {}

    logs.push(
      `エラー: ${error.message}`
    );

    logs.push(
      `エラースクショ: ${errorPath}`
    );

    return {
      success: false,
      logs,
      outputs,
      error: error.message
    };

  } finally {

    await browser.close();
  }
}

module.exports = {
  runWorkflow
};