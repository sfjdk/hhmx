#!/usr/bin/env node
/**
 * 禾禾小冒险 - 反馈读取脚本
 *
 * 从 hhmx.cn 获取反馈列表，在终端中格式化展示。
 * 反馈数据保存 3 天，自动清理过期内容。
 *
 * 用法:
 *   node scripts/read-feedback.js              # 显示所有反馈
 *   node scripts/read-feedback.js --json       # 原始 JSON 输出
 *   node scripts/read-feedback.js --limit 10   # 只显示最新 10 条
 *   node scripts/read-feedback.js --save       # 保存到本地文件
 *   node scripts/read-feedback.js --host localhost:3456 --http  # 本地测试
 *   node scripts/read-feedback.js --insecure   # 跳过 SSL 证书验证
 *   node scripts/read-feedback.js --images     # 提取图片到 feedback_images/ 目录
 *   node scripts/read-feedback.js --html       # 生成 HTML 报告并在浏览器中打开
 *   node scripts/read-feedback.js --txt        # 导出为 TXT + 图片文件夹，打开目录
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// -- 配置 --
const DEFAULT_HOST = 'hhmx.cn';
const DEFAULT_PROTOCOL = 'https:';
const FEEDBACK_API = '/api/feedback';
const OUTPUT_DIR = path.join(__dirname, '..', 'server', 'data');
const IMAGES_DIR = path.join(__dirname, '..', 'feedback_images');

// -- 解析命令行参数 --
const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
  save: args.includes('--save'),
  insecure: args.includes('--insecure'),
  images: args.includes('--images'),
  html: args.includes('--html'),
  txt: args.includes('--txt'),
  host: getArg('--host') || DEFAULT_HOST,
  limit: parseInt(getArg('--limit') || '0', 10),
  protocol: args.includes('--http') ? 'http:' : DEFAULT_PROTOCOL,
};

// 跳过 SSL 证书验证（仅用于自签名证书或本地测试）
if (flags.insecure) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

// -- 格式化工具 --
function formatTime(ts) {
  // 兼容秒和毫秒：13位及以上为毫秒，否则为秒
  const ms = ts > 1000000000000 ? ts : ts * 1000;
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function truncate(str, maxLen = 80) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}

function stripImage(str) {
  // 移除 base64 图片数据，只保留前缀提示
  if (!str) return null;
  if (str.startsWith('data:image/')) {
    const mime = str.match(/^data:(image\/\w+);/);
    return `[图片: ${mime ? mime[1] : '未知格式'}, ${Math.round(str.length / 1024)}KB]`;
  }
  return str;
}

// -- 图片提取到文件 --
function extractImages(fb) {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const saved = [];
  const items = flags.limit > 0 ? [...fb].sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, flags.limit) : fb;

  items.forEach((item) => {
    if (!item.image || !item.image.startsWith('data:image/')) return;
    const mimeMatch = item.image.match(/^data:(image\/\w+);/);
    const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'png';
    const base64Data = item.image.replace(/^data:image\/\w+;base64,/, '');
    const filename = `fb_${item.id || 'unknown'}.${ext}`;
    const filepath = path.join(IMAGES_DIR, filename);
    try {
      fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
      saved.push({ ...item, imageFile: filepath });
      console.error(`🖼️  已保存: ${filename}`);
    } catch (e) {
      console.error(`❌ 保存失败 [${filename}]: ${e.message}`);
    }
  });
  return saved;
}

// -- 生成 HTML 报告 --
function generateHtml(fb) {
  const items = [...fb].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const displayItems = flags.limit > 0 ? items.slice(0, flags.limit) : items;

  const rows = displayItems.map((item, i) => {
    const time = item.created_at ? formatTime(item.created_at) : '未知时间';
    const user = (item.username || '?').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const text = (item.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    const imgTag = (item.image && item.image.startsWith('data:image/'))
      ? `<br><img src="${item.image}" style="max-width:400px;max-height:300px;border-radius:8px;border:1px solid #444;margin-top:10px" loading="lazy">`
      : '';
    return `<div style="border-bottom:1px solid #333;padding:16px 0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="color:#f0c040">👤 ${user}</strong>
        <span style="color:#888;font-size:13px">🕐 ${time}</span>
      </div>
      ${text ? `<p style="margin:6px 0;white-space:pre-wrap;word-break:break-word;line-height:1.6">${text}</p>` : ''}
      ${imgTag}
      <div style="color:#666;font-size:11px;margin-top:4px">ID: ${item.id || '?'}</div>
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>禾禾小冒险 - 用户反馈报告</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#1a1a2e; color:#e0e0e0; font-family: -apple-system, "Microsoft YaHei", sans-serif; padding:20px; min-height:100vh; }
  .container { max-width:800px; margin:0 auto; }
  h1 { text-align:center; color:#f0c040; margin-bottom:8px; font-size:24px; }
  .meta { text-align:center; color:#888; font-size:13px; margin-bottom:24px; }
  .stats { display:flex; justify-content:center; gap:24px; margin-bottom:30px; }
  .stat { background:#16213e; padding:12px 24px; border-radius:10px; text-align:center; }
  .stat-num { font-size:28px; color:#f0c040; font-weight:bold; }
  .stat-label { font-size:12px; color:#888; margin-top:4px; }
</style>
</head>
<body>
<div class="container">
  <h1>📋 禾禾小冒险 - 用户反馈报告</h1>
  <p class="meta">导出时间: ${new Date().toLocaleString('zh-CN')} ｜ 来源: ${flags.protocol}//${flags.host} ｜ 共 ${fb.length} 条反馈（3天内）</p>
  <div class="stats">
    <div class="stat"><div class="stat-num">${fb.length}</div><div class="stat-label">📝 总反馈</div></div>
    <div class="stat"><div class="stat-num">${fb.filter(f => f.image && f.image.startsWith('data:image/')).length}</div><div class="stat-label">🖼️ 含图片</div></div>
    <div class="stat"><div class="stat-num">${[...new Set(fb.map(f => f.username))].length}</div><div class="stat-label">👥 反馈用户</div></div>
  </div>
  ${rows}
  <p style="text-align:center;color:#666;margin-top:30px;font-size:12px">💡 反馈数据保留 3 天，自动清理过期内容。</p>
</div>
</body>
</html>`;

  const filepath = path.join(IMAGES_DIR, 'feedback_report.html');
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.writeFileSync(filepath, html, 'utf-8');
  return filepath;
}

// -- 生成 TXT 报告 + 图片文件夹 --
function generateTxt(fb) {
  const items = [...fb].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const displayItems = flags.limit > 0 ? items.slice(0, flags.limit) : items;

  // 创建带时间戳的输出目录
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dirName = `反馈导出_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const exportDir = path.join(__dirname, '..', dirName);
  const imgDir = path.join(exportDir, 'images');

  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  // 提取图片
  const imgMap = new Map(); // id -> 相对文件名
  displayItems.forEach((item) => {
    if (!item.image || !item.image.startsWith('data:image/')) return;
    const mimeMatch = item.image.match(/^data:(image\/\w+);/);
    const ext = mimeMatch ? mimeMatch[1].split('/')[1] : 'png';
    const base64Data = item.image.replace(/^data:image\/\w+;base64,/, '');
    const filename = `fb_${item.id || 'unknown'}.${ext}`;
    try {
      fs.writeFileSync(path.join(imgDir, filename), Buffer.from(base64Data, 'base64'));
      imgMap.set(item.id, `images/${filename}`);
    } catch (e) {
      console.error(`❌ 图片保存失败 [${filename}]: ${e.message}`);
    }
  });

  const imgCount = imgMap.size;
  const userCount = [...new Set(displayItems.map(f => f.username))].length;

  // 构建 TXT 内容
  const lines = [];
  const SEP = '═'.repeat(56);

  lines.push(SEP);
  lines.push('  禾禾小冒险 - 用户反馈报告');
  lines.push(`  导出时间: ${now.toLocaleString('zh-CN')}`);
  lines.push(`  来源: ${flags.protocol}//${flags.host}`);
  lines.push(`  共 ${fb.length} 条反馈（3天内）｜ 含图片: ${imgCount} 条 ｜ 反馈用户: ${userCount} 人`);
  lines.push(SEP);
  lines.push('');

  displayItems.forEach((item, i) => {
    const time = item.created_at ? formatTime(item.created_at) : '未知时间';
    const user = item.username || '?';
    const text = item.text || '（仅图片）';
    const imgRef = imgMap.get(item.id);

    lines.push(`[#${i + 1}] ${user} | ${time}`);
    // 多行文字，每行缩进两个空格
    text.split('\n').forEach(line => lines.push(`  ${line}`));
    if (imgRef) {
      lines.push(`  🖼️  图片: ${imgRef}`);
    }
    lines.push('');
  });

  lines.push(SEP);
  lines.push('  图片附件保存在 images/ 目录下');
  lines.push(SEP);

  const txtPath = path.join(exportDir, '反馈报告.txt');
  fs.writeFileSync(txtPath, lines.join('\n'), 'utf-8');

  console.error(`📝 TXT 报告: ${txtPath}`);
  console.error(`🖼️  图片目录: ${imgDir} (${imgCount} 张)`);

  return exportDir;
}

// -- 跨平台打开文件/URL --
function openFile(filepath) {
  const cmd = process.platform === 'win32'
    ? `start "" "${filepath}"`
    : process.platform === 'darwin'
      ? `open "${filepath}"`
      : `xdg-open "${filepath}"`;
  require('child_process').exec(cmd, (err) => {
    if (err) console.error(`⚠️  无法自动打开浏览器: ${err.message}\n   请手动打开: ${filepath}`);
  });
}

// -- 主逻辑 --
function fetchFeedback() {
  const url = `${flags.protocol}//${flags.host}${FEEDBACK_API}`;
  console.error(`🌐 正在请求: ${url}`);

  return new Promise((resolve, reject) => {
    const client = flags.protocol === 'https:' ? https : http;

    const req = client.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!Array.isArray(json)) {
            reject(new Error(`API 返回非数组数据: ${typeof json}`));
            return;
          }
          resolve(json);
        } catch (e) {
          reject(new Error(`JSON 解析失败: ${e.message}\n原始数据: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`网络请求失败: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时 (10s)')); });
  });
}

function displayFeedback(fb) {
  if (fb.length === 0) {
    console.log('\n📭 暂无反馈\n');
    return;
  }

  // 按时间倒序排列
  const sorted = [...fb].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const items = flags.limit > 0 ? sorted.slice(0, flags.limit) : sorted;

  console.log(`\n📋 禾禾小冒险 - 用户反馈 (共 ${fb.length} 条${flags.limit > 0 ? `，显示最新 ${items.length} 条` : ''})`);
  console.log('═'.repeat(60));

  items.forEach((item, i) => {
    const time = item.created_at ? formatTime(item.created_at) : '未知时间';
    const user = item.username || '?';
    const text = item.text || '';
    const hasImage = item.image && item.image.startsWith('data:image/');

    console.log(`\n┌─ #${i + 1} ─────────────────────────────────────────────┐`);
    console.log(`│ 👤 ${user.padEnd(16)} 🕐 ${time}`);
    console.log(`│ ID: ${item.id || '?'}`);

    if (text) {
      // 多行文字处理
      const lines = text.split('\n');
      lines.forEach((line, li) => {
        const prefix = li === 0 ? '│ 💬 ' : '│    ';
        // 如果一行太长则截断
        const displayLine = truncate(line, 70);
        console.log(`${prefix}${displayLine}`);
      });
    }

    if (hasImage) {
      const kb = Math.round(item.image.length / 1024);
      console.log(`│ 🖼️  [附带图片: ${kb}KB]`);
      if (flags.images && item._imageFile) {
        console.log(`│ 📁 已保存: ${item._imageFile}`);
      }
    }

    console.log('└──────────────────────────────────────────────────┘');
  });

  console.log(`\n💡 提示: 反馈自动清理超过 3 天的内容。`);
  console.log(`   使用 --json 查看原始数据，--limit N 限制显示条数，--save 保存到本地。`);
  console.log(`   使用 --txt 导出 TXT+图片文件夹，--html 生成浏览器报告，--images 提取图片。\n`);
}

function saveToFile(fb) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filepath = path.join(OUTPUT_DIR, 'feedback_export.json');
  const data = {
    exported_at: new Date().toISOString(),
    source: `${flags.protocol}//${flags.host}`,
    count: fb.length,
    items: fb,
  };
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`💾 已保存到: ${filepath}`);
}

// -- 执行 --
(async () => {
  try {
    const feedback = await fetchFeedback();

    // 提取图片到文件
    if (flags.images) {
      const saved = extractImages(feedback);
      // 将图片文件路径合并回反馈条目，供 displayFeedback 展示
      const imgMap = new Map(saved.map(s => [s.id, s.imageFile]));
      feedback.forEach(f => { if (imgMap.has(f.id)) f._imageFile = imgMap.get(f.id); });
      console.error('');
    }

    // 生成 HTML 报告
    let htmlPath = null;
    if (flags.html) {
      htmlPath = generateHtml(feedback);
      console.error(`📄 HTML 报告已生成: ${htmlPath}`);
    }

    // 生成 TXT 报告 + 图片文件夹
    let txtDir = null;
    if (flags.txt) {
      txtDir = generateTxt(feedback);
      console.error('');
    }

    if (flags.json) {
      console.log(JSON.stringify(feedback, null, 2));
    } else {
      displayFeedback(feedback);
    }

    if (flags.save) {
      saveToFile(feedback);
    }

    // 自动打开浏览器查看 HTML 报告
    if (flags.html && htmlPath) {
      console.error('🌐 正在打开浏览器...');
      openFile(htmlPath);
    }

    // 打开 TXT 导出目录
    if (flags.txt && txtDir) {
      console.error('📂 正在打开导出目录...');
      openFile(txtDir);
    }
  } catch (err) {
    console.error(`\n❌ 错误: ${err.message}\n`);

    // 友好的错误提示
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
      console.error('💡 提示: 确保服务器正在运行，或使用 --host 指定正确的地址。');
      console.error('   例如: node scripts/read-feedback.js --host localhost:3456 --http\n');
    }
    process.exit(1);
  }
})();
