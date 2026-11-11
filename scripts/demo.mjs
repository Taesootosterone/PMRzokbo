import { Store } from "../lib/store.mjs";
import { demoContent } from "../lib/demo.mjs";
const db = new Store();
try {
  console.log(await db.importContent(demoContent));
} finally {
  db.close();
}
