// Test-only memory capability. Its policy flags are simulated, never native qualification.
import { randomUUID } from "node:crypto";
import { basename, dirname, sep } from "node:path";
const IDENTITY_BASE = Object.freeze({
  volumeSerialNumber: "0000000000000001",
  fileId: "00000000000000000000000000000001",
  linkCount: 1,
});

export function memoryWindowsFilesystem() {
  const files = new Map();
  let nextId = 1;
  const identityFor = () => ({
    ...IDENTITY_BASE,
    fileId: nextId.toString(16).padStart(32, "0"),
  });
  return {
    productionSafe: true,
    pathWalkRaceSafe: true,
    files,
    directories: new Set(),
    ensureDirectory(path) {
      this.directories.add(path);
      return IDENTITY_BASE;
    },
    readFile(path) {
      const value = files.get(path);
      if (!value) {
        const error = new Error("missing");
        error.code = "ENOENT";
        throw error;
      }
      return { data: Buffer.from(value.data), identity: value.identity };
    },
    createFile(path, data) {
      if (files.has(path)) {
        const error = new Error("exists");
        error.code = "EEXIST";
        throw error;
      }
      const identity = identityFor();
      nextId += 1;
      files.set(path, { data: Buffer.from(data), identity });
      return identity;
    },
    deleteFile(path, identity) {
      const value = files.get(path);
      if (!value) {
        const error = new Error("missing");
        error.code = "ENOENT";
        throw error;
      }
      if (value.identity.fileId !== identity.fileId) {
        const error = new Error("changed");
        error.code = "WINDOWS_FILESYSTEM_IDENTITY_MISMATCH";
        throw error;
      }
      files.delete(path);
      return { deleted: true, identity };
    },
  };
}

export function createMemoryIdentityFixture() {
  const adapter = memoryWindowsFilesystem();
  function directory(path) {
    let current = path;
    while (!adapter.directories.has(current)) {
      adapter.directories.add(current);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  adapter.ensureDirectory = (path) => { directory(path); return IDENTITY_BASE; };
  return {
    adapter,
    async directory(path) { directory(path); },
    async tempDirectory(prefix) { const path = `${prefix}${randomUUID()}`; directory(path); return path; },
    async write(path, value) {
      directory(dirname(path));
      const existing = adapter.files.get(path);
      if (existing) existing.data = Buffer.from(value);
      else adapter.createFile(path, Buffer.from(value));
    },
    async read(path, encoding) {
      const { data } = adapter.readFile(path);
      return encoding ? data.toString(encoding) : data;
    },
    async entries(path) {
      return [...new Set([...adapter.files.keys(), ...adapter.directories]
        .filter((value) => value !== path && dirname(value) === path).map((value) => basename(value)))].sort();
    },
    async stat(path) {
      const file = adapter.readFile(path);
      return { ino: file.identity.fileId, size: file.data.length, nlink: file.identity.linkCount };
    },
    async rename(from, to) {
      const file = adapter.files.get(from);
      if (!file) { const error = new Error("missing"); error.code = "ENOENT"; throw error; }
      adapter.files.set(to, file);
      adapter.files.delete(from);
    },
    async remove(path, options = {}) {
      const exists = adapter.files.delete(path) || adapter.directories.delete(path);
      if (options.recursive) {
        for (const name of [...adapter.files.keys()]) if (name.startsWith(`${path}${sep}`)) adapter.files.delete(name);
        for (const name of [...adapter.directories]) if (name.startsWith(`${path}${sep}`)) adapter.directories.delete(name);
      }
      if (!exists && !options.force) { const error = new Error("missing"); error.code = "ENOENT"; throw error; }
    },
  };
}
