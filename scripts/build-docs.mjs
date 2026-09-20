// docs/*.html(本文だけ。Claude の Artifact と同じ形式)を、検索エンジンに載せない完全な HTML にして書き出す。
// 使い方: node scripts/build-docs.mjs(npm run build の前にも自動で実行される)
// - docs/*.html        利用者向け(公開)。public/docs/ に書き出し、/docs/manual, /docs/flow で配る(next.config.ts の rewrites)
// - docs/admin/*.html  運営者向け(非公開)。public には置かず src/content/admin-docs.generated.ts に埋め込み、
//                      運営者だけが開ける /admin/docs/<名前>(src/app/(admin)/admin/docs/[slug]/route.ts)で配る
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const src = join(process.cwd(), "docs");
const adminSrc = join(src, "admin");
const out = join(process.cwd(), "public", "docs");
mkdirSync(out, { recursive: true });

const HEAD = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<style>:root{color-scheme:light dark}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
`;
const wrap = (body) => HEAD + body + "\n</body>\n</html>\n";
const htmlFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".html")).sort() : []);
const titleOf = (body, file) => body.match(/<title>(.*?)<\/title>/)?.[1] ?? file;

// 利用者向け(公開)
const pages = [];
for (const file of htmlFiles(src)) {
  const body = readFileSync(join(src, file), "utf8");
  writeFileSync(join(out, file), wrap(body));
  pages.push({ file, title: titleOf(body, file) });
  console.log(`docs: ${file} → public/docs/${file}`);
}

// 運営者向け(非公開): 完成した HTML を文字列として埋め込む
const adminDocs = {};
for (const file of htmlFiles(adminSrc)) {
  const body = readFileSync(join(adminSrc, file), "utf8");
  adminDocs[file.replace(/\.html$/, "")] = { title: titleOf(body, file), html: wrap(body) };
  console.log(`docs: admin/${file} → src/content/admin-docs.generated.ts`);
}
writeFileSync(
  join(process.cwd(), "src", "content", "admin-docs.generated.ts"),
  `// scripts/build-docs.mjs が docs/admin/*.html から生成する。直接編集しない。\nexport const ADMIN_DOCS: Record<string, { title: string; html: string }> = ${JSON.stringify(adminDocs)};\n`,
);

// 一覧ページ(公開の文書だけ)
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
<body><main><h1>SFA ドキュメント</h1><p>ご利用者向けの文書です。検索エンジンには登録されません。</p><ul>
${list}
</ul></main></body>
</html>
`,
);
console.log("docs: index.html");
