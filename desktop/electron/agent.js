const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { app } = require('electron');

const POLL_INTERVAL = 5000;
const MAX_LOG = 300;

class PrintAgent extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.polling = false;
    this.pollTimer = null;
    this.credentials = null;
    this.cacheDir = null;
    this.print = null;
    try {
      this.print = require('pdf-to-printer');
    } catch {
      this.print = null;
    }
    this.state = {
      status: 'stopped',
      lastPoll: null,
      lastError: null,
      processed: 0,
      completed: 0,
      failed: 0,
      current: null,
    };
    this.logEntries = [];
  }

  log(level, msg) {
    const entry = { ts: Date.now(), level, msg };
    this.logEntries.push(entry);
    if (this.logEntries.length > MAX_LOG) {
      this.logEntries.splice(0, this.logEntries.length - MAX_LOG);
    }
    this.emit('status', this.snapshot());
  }

  snapshot() {
    return { ...this.state, log: this.logEntries.slice(-100) };
  }

  configure(apiUrl, token) {
    if (apiUrl) {
      this.credentials = { apiUrl: String(apiUrl).replace(/\/+$/, ''), token };
    } else {
      this.credentials = null;
    }
  }

  ensureCacheDir() {
    if (!this.cacheDir) {
      this.cacheDir = path.join(app.getPath('userData'), 'print-cache');
    }
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  apiRequest(method, urlPath, body, { binary = false } = {}) {
    const url = new URL(urlPath, this.credentials.apiUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json' };
      if (this.credentials.token) {
        headers.Authorization = `Bearer ${this.credentials.token}`;
      }

      const req = client.request(
        {
          method,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          headers,
        },
        (res) => {
          if (binary) {
            if (res.statusCode !== 200) {
              let data = '';
              res.on('data', (c) => (data += c));
              res.on('end', () =>
                reject(new Error(`Download failed (${res.statusCode}) ${data}`))
              );
              return;
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            return;
          }

          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = { success: false, message: data };
            }
            if (res.statusCode >= 400) {
              const err = new Error(parsed.message || `HTTP ${res.statusCode}`);
              err.status = res.statusCode;
              reject(err);
              return;
            }
            resolve(parsed);
          });
        }
      );

      req.on('error', reject);
      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async downloadFile(jobId, destPath) {
    const buffer = await this.apiRequest('GET', `/api/agent/jobs/${jobId}/file`, null, {
      binary: true,
    });
    fs.writeFileSync(destPath, buffer);
  }

  async reportStatus(jobId, status, message) {
    try {
      await this.apiRequest('PUT', `/api/agent/jobs/${jobId}/status`, { status, message });
    } catch (e) {
      this.log('error', `Failed to report job status: ${e.message}`);
    }
  }

  async pollOnce() {
    if (!this.credentials) return;
    if (this.polling) return;
    this.polling = true;

    try {
      const result = await this.apiRequest('GET', '/api/agent/jobs');
      this.state.lastPoll = new Date().toISOString();
      if (!result.success) throw new Error(result.message || 'Poll failed');

      const jobs = result.data || [];
      for (const job of jobs) {
        if (!this.running) break;
        await this.processJob(job);
      }
    } catch (e) {
      this.state.lastError = e.message;
      this.log('error', `Poll error: ${e.message}`);
      if (e.status === 401) {
        this.emit('auth-expired');
      }
    } finally {
      this.polling = false;
      this.emit('status', this.snapshot());
    }
  }

  async processJob(job) {
    this.state.current = job.id;
    this.state.processed += 1;
    this.log(
      'info',
      `Processing job ${job.id} (Order #${job.order?.token || 'N/A'} | ${job.copies || 1} copy | printer ${job.assignedPrinter || 'default'})`
    );
    this.emit('status', this.snapshot());

    this.ensureCacheDir();
    const filePath = path.join(this.cacheDir, `${job.id}.pdf`);

    try {
      await this.downloadFile(job.id, filePath);
      this.log('info', `Downloaded print-ready file for job ${job.id}`);
    } catch (e) {
      this.state.failed += 1;
      this.state.current = null;
      this.log('error', `Download failed for job ${job.id}: ${e.message}`);
      await this.reportStatus(job.id, 'FAILED', e.message);
      this.emit('status', this.snapshot());
      return;
    }

    if (!this.print) {
      this.log('warn', `[SIMULATED] Printing job ${job.id} (pdf-to-printer unavailable)`);
      await this.reportStatus(job.id, 'COMPLETED');
      this.state.completed += 1;
      this.state.current = null;
      try {
        fs.unlinkSync(filePath);
      } catch {}
      this.emit('status', this.snapshot());
      return;
    }

    try {
      const options = { printer: job.assignedPrinter, silent: true };
      if (job.copies && job.copies > 1) options.copies = job.copies;
      if (job.printStyle === 'duplex') {
        options.side = job.flipDirection === 'short-edge' ? 'duplexshort' : 'duplex';
      } else {
        options.side = 'simplex';
      }
      if (job.paperSize) options.paperSize = job.paperSize;

      this.log(
        'info',
        `Sending to printer (${options.side}, ${options.copies || 1} copy, ${options.paperSize || 'A4'})`
      );
      await this.print.print(filePath, options);
      this.log('info', `Print sent for job ${job.id}`);
      await this.reportStatus(job.id, 'COMPLETED');
      this.state.completed += 1;
    } catch (e) {
      this.state.failed += 1;
      this.log('error', `Print failed for job ${job.id}: ${e.message}`);
      await this.reportStatus(job.id, 'FAILED', e.message);
    } finally {
      this.state.current = null;
      try {
        fs.unlinkSync(filePath);
      } catch {}
      this.emit('status', this.snapshot());
    }
  }

  start() {
    if (!this.credentials) {
      this.log('warn', 'Cannot start agent: not configured');
      return;
    }
    if (this.running) return;
    this.running = true;
    this.state.status = 'running';
    this.log('info', `Agent started (polling every ${POLL_INTERVAL / 1000}s)`);
    this.pollOnce();
    this.pollTimer = setInterval(() => this.pollOnce(), POLL_INTERVAL);
    this.emit('status', this.snapshot());
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.state.status = 'stopped';
    this.log('info', 'Agent stopped');
    this.emit('status', this.snapshot());
  }
}

module.exports = { PrintAgent, POLL_INTERVAL };
