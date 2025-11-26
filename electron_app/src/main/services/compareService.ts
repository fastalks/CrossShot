import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { ScreenshotMeta, CompareResult } from '../../shared/types';

class CompareService {
  async compareImages(img1Path: string, img2Path: string): Promise<CompareResult> {
    try {
      const img1 = PNG.sync.read(fs.readFileSync(img1Path));
      const img2 = PNG.sync.read(fs.readFileSync(img2Path));

      if (img1.width !== img2.width || img1.height !== img2.height) {
        return {
          success: false,
          error: 'Image dimensions do not match',
          dimensions: {
            img1: { width: img1.width, height: img1.height },
            img2: { width: img2.width, height: img2.height },
          },
        };
      }

      const { width, height } = img1;
      const diff = new PNG({ width, height });

      const diffPixels = pixelmatch(
        img1.data,
        img2.data,
        diff.data,
        width,
        height,
        { threshold: 0.1 }
      );

      const totalPixels = width * height;
      const diffPercentage = Number(((diffPixels / totalPixels) * 100).toFixed(2));

      const diffPath = this.buildDiffPath(img1Path);
      fs.writeFileSync(diffPath, PNG.sync.write(diff));

      return {
        success: true,
        diffPixels,
        totalPixels,
        diffPercentage,
        diffImagePath: diffPath,
        isSame: diffPixels === 0,
      };
    } catch (error) {
      console.error('Image comparison failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown compare error',
      };
    }
  }

  async batchCompare(screenshots: ScreenshotMeta[]): Promise<Array<{ img1: ScreenshotMeta; img2: ScreenshotMeta; comparison: CompareResult }>> {
    const results: Array<{ img1: ScreenshotMeta; img2: ScreenshotMeta; comparison: CompareResult }> = [];

    for (let index = 0; index < screenshots.length - 1; index += 1) {
      const comparison = await this.compareImages(
        screenshots[index].path,
        screenshots[index + 1].path,
      );

      results.push({
        img1: screenshots[index],
        img2: screenshots[index + 1],
        comparison,
      });
    }

    return results;
  }

  private buildDiffPath(sourcePath: string): string {
    const directory = path.dirname(sourcePath);
    const ext = path.extname(sourcePath);
    const base = path.basename(sourcePath, ext);
    return path.join(directory, `${base}_diff${ext || '.png'}`);
  }
}

export default CompareService;
