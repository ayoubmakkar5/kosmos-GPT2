'use strict';
/**
 * Tiny JSON-file store. Zero dependencies, atomic writes, debounced flushes.
 *
 * Phase 1 uses one store file per concern (conversations, projects, sessions).
 * The API is intentionally Promise-based so swapping in SQLite later touches
 * only this file.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const config = require('./config');

class Store {
  constructor(name, defaults) {
    this.name = name;
    this.file = path.join(config.dataDir, `${name}.json`);
    this.defaults = defaults;
    this.data = structuredClone(defaults);
    this._timer = null;
    this._writing = null;
  }

  async load() {
    await fsp.mkdir(config.dataDir, { recursive: true });
    try {
      const raw = await fsp.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = { ...structuredClone(this.defaults), ...parsed };
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`[store:${this.name}] unreadable, starting fresh:`, err.message);
      this.data = structuredClone(this.defaults);
    }
    return this.data;
  }

  flush() {
    if (this._timer) return this._writing || Promise.resolve();
    this._timer = setTimeout(() => { this._timer = null; }, 0);
    this._writing = this._writeLoop();
    return this._writing;
  }

  async _writeLoop() {
    // coalesce concurrent saves into one write of the newest snapshot
    if (this._busy) return this._busy;
    this._busy = (async () => {
      do {
        this._dirty = false;
        const tmp = `${this.file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        await fsp.mkdir(path.dirname(this.file), { recursive: true });
        await fsp.writeFile(tmp, JSON.stringify(this.data));
        await fsp.rename(tmp, this.file);
      } while (this._dirty);
      this._busy = null;
    })();
    this._dirty = true;
    return this._busy;
  }

  save() {
    this._dirty = true;
    return this.flush();
  }

  async saveNow() {
    if (this._busy) await this._busy;
    const tmp = `${this.file}.tmp`;
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify(this.data));
    await fsp.rename(tmp, this.file);
  }
}

module.exports = { Store, fs };
