import * as crypto from 'crypto';
import {promises as fsPromises} from 'fs';

export interface Globber {
  getSearchPaths(): string[];
  glob(): Promise<string[]>;
  globGenerator(): AsyncGenerator<string, void>;
}

class GlobberImpl implements Globber {
  private readonly patterns: string[];

  constructor(patterns: string[]) {
    this.patterns = patterns;
  }

  getSearchPaths(): string[] {
    return this.patterns.slice();
  }

  async glob(): Promise<string[]> {
    const results: string[] = [];
    for await (const p of this.globGenerator()) {
      results.push(p);
    }
    return results;
  }

  async *globGenerator(): AsyncGenerator<string, void> {
    for (const pattern of this.patterns) {
      for await (const file of fsPromises.glob(pattern)) {
        yield file;
      }
    }
  }
}

export async function create(patterns: string): Promise<Globber> {
  const patternList = patterns
    .split(/\r?\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  return new GlobberImpl(patternList);
}

export async function hashFiles(patterns: string): Promise<string> {
  const globber = await create(patterns);
  const files = (await globber.glob()).sort();

  if (files.length === 0) {
    return '';
  }

  const result = crypto.createHash('sha256');
  for (const file of files) {
    const stat = await fsPromises.lstat(file);
    if (stat.isDirectory()) continue;

    const hash = crypto.createHash('sha256');
    if (stat.isSymbolicLink()) {
      hash.update(await fsPromises.readlink(file));
    } else {
      hash.update(await fsPromises.readFile(file));
    }
    result.update(hash.digest());
  }

  return result.digest('hex');
}
