const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Build an express router that proxies traffic to the backing APIs using
// Kubernetes service DNS names by default. These defaults can be overridden
// via environment variables to support custom topologies.
const router = express.Router();

const proxyMap = {
  '/galaxies': process.env.GALAXIES_URL || 'http://galaxies-svc.vastaya.svc.cluster.local:8081',
  '/planets': process.env.PLANETS_URL || 'http://planets-svc.vastaya.svc.cluster.local:8082',
  '/comments': process.env.COMMENTS_URL || 'http://comments-svc.vastaya.svc.cluster.local:8083',
};

Object.entries(proxyMap).forEach(([route, target]) => {
  router.use(route, createProxyMiddleware({
    target,
    changeOrigin: true,
    preserveHeaderKeyCase: true,
    logLevel: 'warn',
    pathRewrite: (_path, req) => {
      const rewrittenPath = req.originalUrl.replace(/^\/api/, '') || '/';
      console.log(`[Frontend API Proxy] ${req.method} ${req.originalUrl} -> ${target}${rewrittenPath}`);
      return rewrittenPath;
    },
  }));
});

module.exports = router;
