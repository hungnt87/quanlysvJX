import fs from 'node:fs';

export class EnvRepository {
  constructor(private readonly envFilePath: string) {}

  /**
   * Kiểm tra tệp .env có tồn tại không
   */
  exists(): boolean {
    return fs.existsSync(this.envFilePath);
  }

  /**
   * Đọc nội dung tệp .env
   */
  read(): string {
    return fs.readFileSync(this.envFilePath, 'utf8');
  }

  /**
   * Ghi nội dung mới vào tệp .env
   */
  write(content: string): void {
    fs.writeFileSync(this.envFilePath, content, 'utf8');
  }
}
