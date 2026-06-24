require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { runWorkflow } = require('./workflow_runner');

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.AUTOMATION_API_KEY;

const rootDir = path.join(__dirname, '..');
const sitesDir = path.join(rootDir, 'configs', 'sites');
const usersDir = path.join(rootDir, 'configs', 'users');
const workflowsDir = path.join(rootDir, 'configs', 'workflows');
const resultsDir = path.join(rootDir, 'storage', 'results');
const screenshotsDir = path.join(rootDir, 'storage', 'screenshots');

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function requireApiKey(req, res, next) {
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'AUTOMATION_API_KEY が未設定です'
    });
  }

  const requestApiKey = req.header('x-api-key');

  if (!requestApiKey || requestApiKey !== apiKey) {
    return res.status(401).json({
      success: false,
      error: 'APIキーが不正です'
    });
  }

  next();
}

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(
    filePath,
    JSON.stringify(value, null, 2),
    'utf-8'
  );
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  return fs
    .readdirSync(dirPath)
    .filter((fileName) => fileName.endsWith('.json') && !fileName.endsWith('.example.json'))
    .map((fileName) => {
      const filePath = path.join(dirPath, fileName);
      const stat = fs.statSync(filePath);

      return {
        fileName,
        filePath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function listImageFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  return fs
    .readdirSync(dirPath)
    .filter((fileName) => {
      const lower = fileName.toLowerCase();
      return (
        lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.webp')
      );
    })
    .map((fileName) => {
      const filePath = path.join(dirPath, fileName);
      const stat = fs.statSync(filePath);

      return {
        fileName,
        filePath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function isSafeFileName(fileName) {
  return (
    typeof fileName === 'string' &&
    !fileName.includes('..') &&
    !fileName.includes('/') &&
    !fileName.includes('\\')
  );
}

function isSafeKey(value) {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9_-]+$/.test(value)
  );
}

function filterBySiteKey(items, siteKey) {
  if (!siteKey) return items;

  return items.filter((item) => {
    if (!item.siteKey) return false;
    return item.siteKey === siteKey;
  });
}

function validateWorkflowJson(workflow) {
  if (!workflow || typeof workflow !== 'object') {
    return 'Workflow JSONが不正です';
  }

  if (!isSafeKey(workflow.workflowKey)) {
    return 'workflowKey は英数字・ハイフン・アンダースコアのみで指定してください';
  }

  if (!isSafeKey(workflow.siteKey)) {
    return 'siteKey は英数字・ハイフン・アンダースコアのみで指定してください';
  }

  if (!workflow.name || typeof workflow.name !== 'string') {
    return 'name は必須です';
  }

  if (!workflow.startUrl || typeof workflow.startUrl !== 'string') {
    return 'startUrl は必須です';
  }

  if (!Array.isArray(workflow.steps)) {
    return 'steps は配列で指定してください';
  }

  for (const [index, step] of workflow.steps.entries()) {
    if (!step || typeof step !== 'object') {
      return `steps[${index}] が不正です`;
    }

    if (!step.type || typeof step.type !== 'string') {
      return `steps[${index}].type は必須です`;
    }
  }

  return null;
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'automation-server',
    message: 'root endpoint'
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'automation-server',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/sites', requireApiKey, (req, res) => {
  try {
    const files = listJsonFiles(sitesDir);

    const sites = files.map((file) => {
      const json = safeReadJson(file.filePath);

      return {
        siteKey: json.siteKey,
        displayName: json.displayName,
        baseUrl: json.baseUrl,
        description: json.description || '',
        fileName: file.fileName,
        modifiedAt: file.modifiedAt
      };
    });

    res.json({
      success: true,
      sites
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/users', requireApiKey, (req, res) => {
  try {
    const siteKey = req.query.siteKey ? req.query.siteKey.toString() : null;
    const files = listJsonFiles(usersDir);

    const users = files.map((file) => {
      const json = safeReadJson(file.filePath);

      return {
        userKey: json.userKey,
        siteKey: json.siteKey || null,
        displayName: json.displayName,
        fileName: file.fileName,
        modifiedAt: file.modifiedAt
      };
    });

    res.json({
      success: true,
      users: filterBySiteKey(users, siteKey)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/workflows', requireApiKey, (req, res) => {
  try {
    const siteKey = req.query.siteKey ? req.query.siteKey.toString() : null;
    const files = listJsonFiles(workflowsDir);

    const workflows = files.map((file) => {
      const json = safeReadJson(file.filePath);

      return {
        workflowKey: json.workflowKey,
        siteKey: json.siteKey || null,
        name: json.name,
        startUrl: json.startUrl,
        stepCount: Array.isArray(json.steps) ? json.steps.length : 0,
        fileName: file.fileName,
        modifiedAt: file.modifiedAt
      };
    });

    res.json({
      success: true,
      workflows: filterBySiteKey(workflows, siteKey)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/workflows/:workflowKey', requireApiKey, (req, res) => {
  try {
    const workflowKey = req.params.workflowKey;

    if (!isSafeKey(workflowKey)) {
      return res.status(400).json({
        success: false,
        error: 'workflowKey が不正です'
      });
    }

    const filePath = path.join(workflowsDir, `${workflowKey}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Workflowが見つかりません'
      });
    }

    const workflow = safeReadJson(filePath);

    res.json({
      success: true,
      workflow
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/workflows', requireApiKey, (req, res) => {
  try {
    const workflow = req.body;

    const validationError = validateWorkflowJson(workflow);

    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError
      });
    }

    const filePath = path.join(workflowsDir, `${workflow.workflowKey}.json`);

    writeJson(filePath, workflow);

    res.json({
      success: true,
      workflowKey: workflow.workflowKey,
      fileName: `${workflow.workflowKey}.json`,
      message: 'Workflowを保存しました'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/results', requireApiKey, (req, res) => {
  try {
    const files = listJsonFiles(resultsDir);

    const results = files.map((file) => {
      let summary = null;

      try {
        const json = safeReadJson(file.filePath);

        summary = {
          workflowKey: json.workflowKey,
          userKey: json.userKey,
          executedAt: json.executedAt,
          outputKeys: json.outputs ? Object.keys(json.outputs) : []
        };
      } catch (_) {
        summary = null;
      }

      return {
        fileName: file.fileName,
        size: file.size,
        modifiedAt: file.modifiedAt,
        summary
      };
    });

    res.json({
      success: true,
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/results/:fileName', requireApiKey, (req, res) => {
  try {
    const fileName = req.params.fileName;

    if (!isSafeFileName(fileName) || !fileName.endsWith('.json')) {
      return res.status(400).json({
        success: false,
        error: '不正なファイル名です'
      });
    }

    const filePath = path.join(resultsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: '結果ファイルが見つかりません'
      });
    }

    const json = safeReadJson(filePath);

    res.json({
      success: true,
      result: json
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/screenshots', requireApiKey, (req, res) => {
  try {
    const screenshots = listImageFiles(screenshotsDir).map((file) => {
      return {
        fileName: file.fileName,
        size: file.size,
        modifiedAt: file.modifiedAt,
        url: `/api/screenshots/${encodeURIComponent(file.fileName)}`
      };
    });

    res.json({
      success: true,
      screenshots
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/screenshots/:fileName', requireApiKey, (req, res) => {
  try {
    const fileName = req.params.fileName;

    if (!isSafeFileName(fileName)) {
      return res.status(400).json({
        success: false,
        error: '不正なファイル名です'
      });
    }

    const lower = fileName.toLowerCase();

    const isImage =
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.webp');

    if (!isImage) {
      return res.status(400).json({
        success: false,
        error: '画像ファイルのみ取得できます'
      });
    }

    const filePath = path.join(screenshotsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'スクリーンショットが見つかりません'
      });
    }

    return res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/run-workflow', requireApiKey, async (req, res) => {
  const { userKey, workflowKey, runtime } = req.body;

  if (!userKey) {
    return res.status(400).json({
      success: false,
      error: 'userKey は必須です'
    });
  }

  if (!workflowKey) {
    return res.status(400).json({
      success: false,
      error: 'workflowKey は必須です'
    });
  }

  try {
    const result = await runWorkflow({
      userKey,
      workflowKey,
      runtime: runtime || {}
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Automation server listening on port ${port}`);
});