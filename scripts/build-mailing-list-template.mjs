// 配信リストに読み込む Excel のひな形 public/templates/mailing-list.xlsx を作る(1 枚目「リスト」は見出しだけ、2 枚目「記入例」に例と説明)。
// 列の並びは src/actions/mailing-lists.ts の importCsvToMailingList と同じ: 氏名, メールアドレス, 会社名。
// 実行: node scripts/build-mailing-list-template.mjs(devDependency の write-excel-file を使う)
import { fileURLToPath } from "node:url";
import writeXlsxFile from "write-excel-file/node";

const HEADER = [
  { value: "氏名", fontWeight: "bold", backgroundColor: "#E8EDF5" },
  { value: "メールアドレス", fontWeight: "bold", backgroundColor: "#E8EDF5" },
  { value: "会社名", fontWeight: "bold", backgroundColor: "#E8EDF5" },
];
const sheet1 = [HEADER];
const sheet2 = [
  HEADER,
  [{ value: "山田 太郎" }, { value: "yamada@example.com" }, { value: "株式会社サンプル" }],
  [{ value: "佐藤 花子" }, { value: "sato@example.co.jp" }, { value: "" }],
  [],
  [{ value: "・1 行に 1 人。1 行目の見出しはそのまま残してください。", span: 3 }],
  [{ value: "・メールアドレスは必須です。無い行は読み込まれません。", span: 3 }],
  [{ value: "・会社名は省略できます。登録済みの取引先があれば表記ゆれ(株式会社の有無・全角半角)を吸収して照合し、無ければ取引先として登録します。", span: 3 }],
  [{ value: "・同じメールアドレスの担当者が登録済みならその人をリストに入れ、無ければ担当者として新しく登録します。", span: 3 }],
  [{ value: "・「リスト」のシートに入力して保存し、配信リストの画面の「Excel / CSV を読み込む」で選んでください。", span: 3 }],
];
const columns = [{ width: 18 }, { width: 32 }, { width: 28 }];
const out = fileURLToPath(new URL("../public/templates/mailing-list.xlsx", import.meta.url));
await writeXlsxFile([{ sheet: "リスト", data: sheet1, columns }, { sheet: "記入例", data: sheet2, columns }]).toFile(out);
console.log("public/templates/mailing-list.xlsx を作成しました");
