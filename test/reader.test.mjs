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
