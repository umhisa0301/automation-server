require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { runWorkflow } = require('./workflow_runner');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

app.post('/api/run-workflow', async (req, res) => {
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