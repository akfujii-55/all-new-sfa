// docs/*.html(本文だけ。Claude の Artifact と同じ形式)を、検索エンジンに載せない完全な HTML にして public/docs/ に書き出す。
// 使い方: node scripts/build-docs.mjs(npm run build の前にも自動で実行される)
// 公開先: https://sfa.art-trading.net/docs/manual, /docs/test-spec(next.config.ts の rewrites で .html を省略)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const src = join(process.cwd(), "docs");
const out = join(process.cwd(), "public", "docs");
mkdirSync(out, { recursive: true });

const pages = [];
for (const file of readdirSync(src).filter((f) => f.endsWith(".html")).sort()) {
  const body = readFileSync(join(src, file), "utf8");
  const title = body.match(/<title>(.*?)<\/title>/)?.[1] ?? file;
  const head = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<style>:root{color-scheme:light dark}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
`;
  writeFileSync(join(out, file), head + body + "\n</body>\n</html>\n");
  pages.push({ file, title });
  console.log(`docs: ${file} → public/docs/${file}`);
}

// 一覧ページ
const list = pages.map((p) => `<li><a href="/docs/${p.file.replace(/\.html$/, "")}">${p.title}</a></li>`).join("\n");
writeFileSync(
  join(out, "index.html"),
  `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>SFA ドキュメント</title>
<style>body{margin:0;padding:40px 20px;font:15px/1.8 "Noto Sans JP","Hiragino Sans",system-ui,sans-serif;background:#fafaf7;color:#1c1d21}main{max-width:640px;margin:0 auto}h1{font-size:22px;margin:0 0 6px}p{color:#5e6270;margin:0 0 20px}ul{padding-left:1.2em}a{color:#2d4fa1}</style>
</head>
<body><main><h1>SFA ドキュメント</h1><p>利用者・運営者向けの文書です。検索エンジンには登録されません。</p><ul>
${list}
</ul></main></body>
</html>
`,
);
console.log("docs: index.html");
