const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  getContentType,
  extractMessageContent,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');

const MAX_LOG = 200;
const ALLOWED_EXT = /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|jpg|jpeg|png)$/i;

function extFromMimetype(mime) {
  if (!mime) return 'bin';
  const map = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'image/jpeg': 'jpg',
    'image/png': 'png',
  };
  return map[mime] || 'bin';
}

class WhatsAppClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.connected = false;
    this.phone = null;
    this.shopName = null;
    this.state = 'idle';
    this.qr = null;
    this.error = null;
    this.logEntries = [];
    this.recentIds = new Set();
    this.stopped = false;
    this.retryTimer = null;
    this.retryDelay = 5000;
    this.credentials = null;
    this.tmpDir = null;
    this.sessionDir = null;
    this.pendingDone = new Map();
  }

  get userDataDir() {
    try {
      const { app } = require('electron');
      return app.getPath('userData');
    } catch {
      return os.tmpdir();
    }
  }

  getTmpDir() {
    if (!this.tmpDir) {
      this.tmpDir = path.join(this.userDataDir, 'whatsapp-media');
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
    return this.tmpDir;
  }

  getSessionDir() {
    if (!this.sessionDir) {
      this.sessionDir = path.join(this.userDataDir, 'whatsapp-session');
    }
    return this.sessionDir;
  }

  log(level, msg) {
    const entry = { ts: Date.now(), level, msg };
    this.logEntries.push(entry);
    if (this.logEntries.length > MAX_LOG) {
      this.logEntries.splice(0, this.logEntries.length - MAX_LOG);
    }
    try {
      fs.appendFileSync(
        path.join(this.userDataDir, 'whatsapp-bot.log'),
        `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}\n`
      );
    } catch {}
    this.broadcast();
  }

  broadcast() {
    this.emit('status', this.getStatus());
  }

  getStatus() {
    return {
      state: this.state,
      connected: this.connected,
      phone: this.phone,
      qr: this.qr,
      error: this.error,
      shopName: this.shopName,
      log: this.logEntries.slice(-100),
    };
  }

  setState(state, extra = {}) {
    this.state = state;
    if (extra.qr !== undefined) this.qr = extra.qr;
    if (extra.error !== undefined) this.error = extra.error;
    if (extra.phone !== undefined) this.phone = extra.phone;
    this.broadcast();
  }

  configure({ apiUrl, token, shopName }) {
    if (apiUrl) {
      this.credentials = {
        apiUrl: String(apiUrl).replace(/\/+$/, ''),
        token,
        shopName: shopName || null,
      };
      this.shopName = this.credentials.shopName;
    } else {
      this.credentials = null;
      this.shopName = null;
    }
  }

  async start(creds) {
    if (creds) this.configure(creds);
    if (!this.credentials) return { success: false, message: 'Not logged in to Patel AutoPrint yet.' };
    if (this.socket) return { success: false, message: 'WhatsApp is already running.' };

    this.stopped = false;
    this.retryDelay = 5000;
    this.setState('connecting');

    const sessionDir = this.getSessionDir();
    const hasSession = fs.existsSync(sessionDir);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const socket = makeWASocket({
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['Patel AutoPrint', 'Chrome', '1.0'],
      syncFullHistory: false,
      markOnlineOnConnect: true,
      defaultQueryTimeoutMs: undefined,
    });

    this.socket = socket;
    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr);
          this.setState('waiting-for-qr', { qr: dataUrl, error: null });
        } catch (err) {
          this.log('error', `QR generation failed: ${err.message}`);
        }
      }
      if (connection === 'open') {
        this.retryDelay = 5000;
        const userId = socket.user?.id || '';
        this.connected = true;
        this.phone = (userId.split(':')[0] || '').split('@')[0] || null;
        this.log('info', this.phone ? `Connected as +${this.phone}` : 'Connected');
        this.setState('connected', { phone: this.phone, error: null });
      }
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        this.connected = false;
        this.phone = null;
        this.socket = null;
        if (this.stopped) return;

        if (statusCode === DisconnectReason.loggedOut) {
          this.log('warn', 'Logged out from WhatsApp');
          // The saved session is no longer valid (device unlinked or session
          // rejected). Clear it so the next link attempt shows a fresh QR
          // instead of restoring a dead session forever.
          try {
            fs.rmSync(this.getSessionDir(), { recursive: true, force: true });
          } catch {}
          this.setState('idle', { error: 'Logged out. Link the shop number again to resume.' });
        } else if (statusCode === DisconnectReason.restartRequired) {
          this.log('info', 'Restarting WhatsApp connection...');
          this.scheduleReconnect();
        } else {
          this.log('warn', `WhatsApp disconnected (${statusCode || 'unknown'})`);
          this.scheduleReconnect();
        }
      }
    });

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      this.log('debug', `messages.upsert event: type=${type}, count=${messages.length}`);
      for (const msg of messages) {
        try {
          await this.handleMessage(msg, type);
        } catch (err) {
          this.log('error', `Message handling error: ${err.message}`);
        }
      }
    });

    socket.ev.on('message-receipt.update', (updates) => {
      if (updates && updates.length) {
        this.log('debug', `message-receipt.update: ${updates.length} receipt(s)`);
      }
    });

    if (hasSession) {
      this.log('info', 'Restoring saved WhatsApp session...');
    } else {
      this.log('info', 'Ready to link. Scan the QR with WhatsApp > Linked Devices.');
    }

    this.broadcast();
    return { success: true };
  }

  scheduleReconnect() {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.log('info', 'Reconnecting to WhatsApp...');
      this.socket = null;
      this.setState('connecting');
      this.start().catch((err) => this.log('error', `Reconnect failed: ${err.message}`));
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 30000);
  }

  async handleMessage(msg, upsertType = 'notify') {
    this.log('debug', `handleMessage: fromMe=${msg.key?.fromMe}, remoteJid=${msg.key?.remoteJid}, id=${msg.key?.id}`);
    if (msg.key?.fromMe) { this.log('debug', 'skip: fromMe'); return; }
    const remoteJid = msg.key?.remoteJid || '';
    if (!remoteJid.endsWith('@s.whatsapp.net')) { this.log('debug', 'skip: not s.whatsapp.net'); return; }
    const msgId = msg.key.id || '';

    const dedupeKey = `${remoteJid}:${msgId}`;
    if (this.recentIds.has(dedupeKey)) { this.log('debug', 'skip: dedupe'); return; }
    this.recentIds.add(dedupeKey);
    if (this.recentIds.size > 2000) {
      const first = this.recentIds.values().next().value;
      this.recentIds.delete(first);
    }

    const customerPhone = remoteJid.split('@')[0];
    const customerName = msg.pushName || null;

    // Unwrap ephemeralMessage, viewOnceMessage, etc. to get the real content
    const unwrapped = extractMessageContent(msg.message);
    const content = getContentType(unwrapped);
    this.log('debug', `Unwrapped content type: ${content} (raw keys: ${Object.keys(msg.message || {}).join(', ')})`);
    if (!content) { this.log('debug', 'skip: no content'); return; }

    // 'append' messages arrive from offline queueing or history sync. Only
    // process ones that are recent so an old history replay never triggers a
    // reply to a customer who messaged days ago.
    if (upsertType === 'append') {
      const ts = Number(msg.messageTimestamp || 0);
      const ageMin = (Date.now() / 1000 - ts) / 60;
      if (ageMin > 15) {
        this.log('debug', `Skipping stale append message (+${customerPhone}, ${ageMin.toFixed(0)}m old)`);
        return;
      }
    }

    this.log('info', `Message from +${customerPhone} (${content})`);

    if (content !== 'imageMessage' && content !== 'documentMessage') {
      const text = (unwrapped?.conversation || unwrapped?.extendedTextMessage?.text || '').trim();
      const pendingLink = this.pendingDone.get(customerPhone);
      if (pendingLink && /^(done|finish|finished|ready|ok|link)$/i.test(text)) {
        this.pendingDone.delete(customerPhone);
        await this.reply(
          customerPhone,
          `Great! Tap this link to set your print options:\n${pendingLink}`
        );
      } else if (text) {
        await this.reply(
          customerPhone,
          `👋 Welcome to ${this.shopName || 'our shop'}!\nSend me your files (PDF, Word, PPT, Excel, JPG, PNG) and I will send you a link to set your print options.`
        );
      }
      return;
    }

    const media = unwrapped[content];
    const mime = media?.mimetype || '';
    const originalName =
      content === 'documentMessage' && media?.filename
        ? media.filename
        : `whatsapp_${Date.now()}.${extFromMimetype(mime)}`;

    if (!ALLOWED_EXT.test(originalName)) {
      await this.reply(
        customerPhone,
        `Sorry, I can't print "${originalName}" (${mime || 'unknown type'}). Please send PDF, Word, PPT, Excel, JPG or PNG.`
      );
      return;
    }

    let buffer;
    try {
      // baileys 6.x signature: downloadMediaMessage(message, 'buffer', options, ctx)
      buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        {
          logger: pino({ level: 'silent' }),
          reuploadRequest: this.socket ? this.socket.updateMediaMessage.bind(this.socket) : undefined,
        }
      );
    } catch (err) {
      this.log('error', `Media download failed: ${err.message}`);
      await this.reply(customerPhone, 'Something went wrong receiving that file. Please try again.');
      return;
    }
    if (!buffer) {
      await this.reply(customerPhone, 'Could not download that file. Please try again.');
      return;
    }

    const tmpDir = this.getTmpDir();
    const tmpName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${originalName.replace(/[^\w.\-]/g, '_')}`;
    const tmpPath = path.join(tmpDir, tmpName);
    try {
      fs.writeFileSync(tmpPath, buffer);
    } catch (err) {
      this.log('error', `Failed to write media to disk: ${err.message}`);
      await this.reply(customerPhone, 'Something went wrong saving that file. Please try again.');
      return;
    }

    this.log('info', `Received "${originalName}" from +${customerPhone}`);

    let data;
    try {
      data = await this.uploadFiles(customerPhone, customerName, [
        { path: tmpPath, name: originalName, mimeType: mime },
      ]);
    } catch (err) {
      this.log('error', `Upload failed: ${err.message}`);
      await this.reply(customerPhone, 'Something went wrong saving that file. Please try again.');
      return;
    } finally {
      try {
        fs.unlinkSync(tmpPath);
      } catch {}
    }

    const link = data.link;
    const count = data.fileCount;
    this.pendingDone.set(customerPhone, link);
    await this.reply(
      customerPhone,
      `✅ Received "${originalName}" (${count} file${count === 1 ? '' : 's'} so far).\n` +
        `Send more files, or reply "DONE" to get your print link.`
    );
  }

  async uploadFiles(customerPhone, customerName, files) {
    const fd = new FormData();
    fd.append('customerPhone', customerPhone);
    if (customerName) fd.append('customerName', customerName);
    for (const f of files) {
      fd.append(
        'files',
        new Blob([fs.readFileSync(f.path)], { type: f.mimeType || 'application/octet-stream' }),
        f.name
      );
    }
    const res = await fetch(`${this.credentials.apiUrl}/api/agent/whatsapp/inbox`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.credentials.token}` },
      body: fd,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || `Upload failed (HTTP ${res.status})`);
    }
    return json.data;
  }

  async reply(customerPhone, text) {
    if (!this.socket) return;
    try {
      await this.socket.sendMessage(`${customerPhone}@s.whatsapp.net`, { text });
    } catch (err) {
      this.log('error', `Reply send failed: ${err.message}`);
    }
  }

  async logout() {
    this.stop();
    try {
      fs.rmSync(this.getSessionDir(), { recursive: true, force: true });
    } catch {}
    this.qr = null;
    this.error = null;
    this.log('info', 'WhatsApp unlinked.');
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try {
        socket.end(undefined);
      } catch {}
    }
    this.connected = false;
    this.phone = null;
    this.qr = null;
    this.error = null;
    this.setState('idle');
  }
}

module.exports = { WhatsAppClient };
