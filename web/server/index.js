const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;
const staticDir = path.resolve(__dirname, '../build');

app.use(express.static(staticDir));
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Frontend server listening on port ${PORT}`);
});
