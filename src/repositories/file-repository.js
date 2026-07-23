/**
 * src/repositories/file-repository.js
 * Repositório de arquivos — isola todo I/O de disco.
 *
 * Responsabilidade: ler, escrever, verificar existência de arquivos.
 * Nenhuma regra de negócio aqui — só operações de sistema de arquivos.
 */
const fs = require('fs');
const path = require('path');

class FileRepository {
  ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  exists(filePath) { return fs.existsSync(filePath); }

  writeFile(filePath, buffer) {
    this.ensureDir(filePath);
    fs.writeFileSync(filePath, buffer);
  }

  readFile(filePath) { return fs.readFileSync(filePath, 'utf-8'); }

  readFileBuffer(filePath) { return fs.readFileSync(filePath); }

  readdir(dirPath) { return fs.readdirSync(dirPath); }

  stat(filePath) {
    try {
      const s = fs.statSync(filePath);
      return { mtime: s.mtime, size: s.size };
    } catch { return null; }
  }

  removePartialDownload(filePath) {
    const crdownload = filePath + '.crdownload';
    if (fs.existsSync(crdownload)) fs.unlinkSync(crdownload);
  }
}

module.exports = FileRepository;
