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
  /**
   * Garante que o diretório de um caminho existe.
   * @param {string} filePath
   */
  ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Verifica se um arquivo existe.
   * @param {string} filePath
   * @returns {boolean}
   */
  exists(filePath) {
    return fs.existsSync(filePath);
  }

  /**
   * Escreve buffer em arquivo.
   * @param {string} filePath
   * @param {Buffer} buffer
   */
  writeFile(filePath, buffer) {
    this.ensureDir(filePath);
    fs.writeFileSync(filePath, buffer);
  }

  /**
   * Retorna stat do arquivo (mtime, size).
   * @param {string} filePath
   * @returns {{ mtime: Date, size: number }|null}
   */
  stat(filePath) {
    try {
      const s = fs.statSync(filePath);
      return { mtime: s.mtime, size: s.size };
    } catch {
      return null;
    }
  }

  /**
   * Remove arquivo de download parcial (.crdownload).
   * @param {string} filePath
   */
  removePartialDownload(filePath) {
    const crdownload = filePath + '.crdownload';
    if (fs.existsSync(crdownload)) {
      fs.unlinkSync(crdownload);
    }
  }
}

module.exports = FileRepository;
