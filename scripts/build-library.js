import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rendered = path.resolve(root, '..', 'extensize-cloner', 'data', 'rendered');
const output = path.join(root, 'public', 'library.json');
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';

const files = fs.readdirSync(rendered).filter(name => name.toLowerCase().endsWith('.mp4')).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
const valid = [];
const ignored = [];

for (const name of files) {
  const fullPath = path.join(rendered, name);
  const probe = spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name,pix_fmt,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', '--', fullPath], { encoding: 'utf8', windowsHide: true });
  if (probe.status !== 0) { ignored.push({ name, reason: 'arquivo inválido' }); continue; }
  try {
    const data = JSON.parse(probe.stdout); const video = data.streams?.[0]; const stat = fs.statSync(fullPath);
    if (!video || video.width !== 1080 || video.height !== 1920) { ignored.push({ name, reason: 'dimensões incompatíveis' }); continue; }
    valid.push({ name, bytes: stat.size, modifiedAt: stat.mtime.toISOString(), width: video.width, height: video.height, codec: video.codec_name, pixelFormat: video.pix_fmt, fps: video.r_frame_rate, duration: Number(Number(data.format?.duration || 0).toFixed(2)), location: 'local' });
  } catch { ignored.push({ name, reason: 'metadados inválidos' }); }
}

fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), totalFiles: files.length, validCount: valid.length, ignoredCount: ignored.length, valid, ignored }, null, 2));
console.log(`Biblioteca: ${valid.length} válidos, ${ignored.length} ignorados.`);
