import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createSource} from '../src/source.mjs';
import {createClient} from '../src/transport.mjs';
import {collect} from '../src/reader.mjs';
let source,client;
before(async () => {source = await createSource();client = createClient(source.origin);});
after(async () => {await source.close();});

test('文章目录读取 front 元数据', async () => {
  assert.equal((await collect(client))[0].title, '工厂参观与公众教育');
  const article = await client('/articles/a1');
  assert.equal(article.body[0].children[1].id, 'f1');
});

test('全文原件保留正文、参考文献与材料收据', async () => {
  const [row] = await collect(client);
  assert.equal(row.id, 'a1');
  assert.equal(row.version, 'v1');
  assert.equal(row.document.body[0].kind, 'sec');
  assert.equal(row.document.back[0].kind, 'ref');
  assert.deepEqual(row.document.subArticles, []);
  assert.equal(row.materials.length, 1);
  const receipt = row.materials[0];
  assert.equal(receipt.scope, null);
  assert.equal(receipt.id, 'supp');
  assert.equal(receipt.href, '/assets/s1');
  assert.equal(receipt.status, 'received');
  assert.equal(receipt.owner, 'a1');
  assert.equal(receipt.version, 'v1');
  assert.equal(receipt.hashVerified, true);
});
