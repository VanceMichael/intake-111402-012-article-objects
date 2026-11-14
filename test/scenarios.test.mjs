import test from 'node:test';
import assert from 'node:assert/strict';
import {createSource} from '../src/source.mjs';
import {createClient} from '../src/transport.mjs';
test('来源变更与异常边界具有可观察的区别',async () => {
  const source = await createSource();
  try {
    const client = createClient(source.origin);
    const choose = name => client('/__scenario',{method:'POST',body:{name}});
await choose('scoped-ids');
const article = await client('/articles/a1');
assert.equal(article.body[1].id,article.subArticles[0].body[0].id);
assert.notEqual(article.body[1].text,article.subArticles[0].body[0].text);
const asset = await client('/assets/s1');
assert.notEqual(article.front.version,asset.version);
} finally {await source.close();}
});
