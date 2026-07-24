import express from 'express';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import winston from 'winston';

const execAsync = promisify(exec);

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'print-agent.log' }),
  ],
});

class PrintAgent {
  constructor() {
    this.config = {
      serverUrl: process.env.SERVER_URL || 'http://localhost:5000',
      agentSecret: process.env.AGENT_SECRET || 'dev-print-agent-secret',
      shopId: process.env.SHOP_ID,
      pollInterval: 5000,
      downloadDir: path.join(os.homedir(), 'PatelAutoPrint'),
    };

    this.agentId = null;
    this.printers = [];
    this.isRunning = false;
  }

  async start() {
    logger.info('Starting Patel AutoPrint Print Agent...');

    try {
      await this.ensureDirectories();
      await this.register();
      await this.discoverPrinters();
      this.startHeartbeat();
      this.startJobPolling();

      this.isRunning = true;
      logger.info('Print Agent started successfully');
    } catch (error) {
      logger.error('Failed to start Print Agent:', error);
      process.exit(1);
    }
  }

  async ensureDirectories() {
    await fs.mkdir(this.config.downloadDir, { recursive: true });
    await fs.mkdir(path.join(this.config.downloadDir, 'jobs'), { recursive: true });
    await fs.mkdir(path.join(this.config.downloadDir, 'logs'), { recursive: true });
  }

  async register() {
    try {
      const response = await axios.post(`${this.config.serverUrl}/api/v1/agent/register`, {
        deviceName: os.hostname(),
        operatingSystem: `${os.platform()} ${os.release()}`,
        version: '2.0.0',
        shopId: this.config.shopId,
        secret: this.config.agentSecret,
      });

      this.agentId = response.data.data.agentId;
      logger.info(`Agent registered with ID: ${this.agentId}`);
    } catch (error) {
      logger.error('Registration failed:', error.message);
      throw error;
    }
  }

  async discoverPrinters() {
    try {
      // Windows printer discovery using PowerShell
      const { stdout } = await execAsync(
        'powershell -Command "Get-Printer | Select-Object Name, DriverName, PrinterStatus, Type | ConvertTo-Json"'
      );

      const printerList = JSON.parse(stdout);
      this.printers = Array.isArray(printerList) ? printerList : [printerList];

      logger.info(`Discovered ${this.printers.length} printers`);

      // Register printers with cloud
      for (const printer of this.printers) {
        await this.registerPrinter(printer);
      }
    } catch (error) {
      logger.error('Printer discovery failed:', error.message);
      this.printers = [];
    }
  }

  async registerPrinter(printer) {
    try {
      await axios.post(
        `${this.config.serverUrl}/api/v1/agent/printers/${printer.Name}/status`,
        {
          status: printer.PrinterStatus === 0 ? 'ONLINE' : 'OFFLINE',
        },
        {
          headers: {
            'x-agent-id': this.agentId,
            'x-agent-token': this.config.agentSecret,
          },
        }
      );
    } catch (error) {
      logger.error(`Failed to register printer ${printer.Name}:`, error.message);
    }
  }

  startHeartbeat() {
    setInterval(async () => {
      try {
        await axios.post(
          `${this.config.serverUrl}/api/v1/agent/heartbeat`,
          {},
          {
            headers: {
              'x-agent-id': this.agentId,
              'x-agent-token': this.config.agentSecret,
            },
          }
        );
        logger.debug('Heartbeat sent');
      } catch (error) {
        logger.error('Heartbeat failed:', error.message);
      }
    }, 30000);
  }

  startJobPolling() {
    setInterval(async () => {
      await this.pollJobs();
    }, this.config.pollInterval);
  }

  async pollJobs() {
    try {
      const response = await axios.get(`${this.config.serverUrl}/api/v1/agent/jobs`, {
        headers: {
          'x-agent-id': this.agentId,
          'x-agent-token': this.config.agentSecret,
        },
      });

      const jobs = response.data.data;

      for (const job of jobs) {
        await this.processJob(job);
      }
    } catch (error) {
      logger.error('Job polling failed:', error.message);
    }
  }

  async processJob(job) {
    logger.info(`Processing job: ${job.id}`);

    try {
      // Update status to downloading
      await this.updateJobStatus(job.id, 'DOWNLOADING');

      // Download print-ready PDF
      const filePath = await this.downloadFile(job);

      // Update status to preparing
      await this.updateJobStatus(job.id, 'PREPARING');

      // Print the file
      await this.printFile(filePath, job.printer);

      // Update status to completed
      await this.updateJobStatus(job.id, 'COMPLETED');

      logger.info(`Job ${job.id} completed successfully`);
    } catch (error) {
      logger.error(`Job ${job.id} failed:`, error.message);
      await this.updateJobStatus(job.id, 'FAILED', error.message);
    }
  }

  async downloadFile(job) {
    const fileName = `job_${job.id}.pdf`;
    const filePath = path.join(this.config.downloadDir, 'jobs', fileName);

    // In production, this would download the actual file from the server
    // For now, we'll create a placeholder
    logger.info(`Downloading file for job ${job.id}`);

    return filePath;
  }

  async printFile(filePath, printer) {
    const printerName = printer.displayName || printer.name;

    logger.info(`Printing to: ${printerName}`);

    // Use PowerShell to print
    const psCommand = `
      Start-Process -FilePath "${filePath}" -Verb PrintTo -ArgumentList "${printerName}" -Wait
    `;

    try {
      await execAsync(`powershell -Command "${psCommand}"`);
      logger.info(`Print job sent to ${printerName}`);
    } catch (error) {
      logger.error(`Print failed: ${error.message}`);
      throw error;
    }
  }

  async updateJobStatus(jobId, status, errorMessage = null) {
    try {
      await axios.put(
        `${this.config.serverUrl}/api/v1/agent/jobs/${jobId}/status`,
        { status, errorMessage },
        {
          headers: {
            'x-agent-id': this.agentId,
            'x-agent-token': this.config.agentSecret,
          },
        }
      );
    } catch (error) {
      logger.error(`Failed to update job status: ${error.message}`);
    }
  }

  stop() {
    this.isRunning = false;
    logger.info('Print Agent stopped');
  }
}

// Start the agent
const agent = new PrintAgent();
agent.start();

process.on('SIGINT', () => {
  agent.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  agent.stop();
  process.exit(0);
});
