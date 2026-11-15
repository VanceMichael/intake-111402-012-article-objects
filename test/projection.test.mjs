import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSource} from '../src/source.mjs';
import {createClient} from '../src/transport.mjs';
import {collect} from '../src/reader.mjs';
import {Archive} from '../src/archive.mjs';
import {createApi} from '../src/api.mjs';
import {projectRow,projectRows} from '../src/projection.mjs';

async function collectScenario(scenario) {
  const source = await createSource({scenario});
  try { return await collect(createClient(source.origin)); }
  finally { await source.close(); }
}

test('正文章节、参考文献与已收材料在阅读视图中分离', async () => {
  const [row] = await collectScenario('normal');
  const view = projectRow(row);
  assert.equal(view.articleId, 'a1');
  assert.equal(view.version, 'v1');
  assert.equal(view.scopes.length, 1);
  const main = view.scopes[0];
  assert.equal(main.scope, null);
  const sec = main.body.find(object => object.id === 's1');
  const fig = main.body.find(object => object.id === 'f1');
  assert.equal(sec.kind, 'sec');
  assert.equal(fig.parent, 's1');
  assert.equal(fig.text, '车间布局');
  assert.deepEqual(main.references.map(object => object.id), ['r1']);
  const relation = main.relations[0];
  assert.equal(relation.refType, 'fig');
  assert.equal(relation.from, 's1');
  assert.deepEqual(relation.targets, [{rid:'f1',status:'resolved',key:fig.key,kind:'fig'}]);
  const [material] = main.materials;
  assert.equal(material.status, 'received');
  assert.deepEqual(material.boundTo, {articleId:'a1',version:'v1'});
  assert.equal(material.versionMatches, true);
  assert.equal(material.hashVerified, true);
  assert.equal(material.data, 'c3VwcGxlbWVudA==');
  assert.deepEqual(view.availability, {
    body:true,objects:3,references:1,
    relations:{targets:1,resolved:1,unresolved:0},
    materials:{declared:1,received:1,failed:0,untracked:0,hashFailed:0}
  });
});

test('子文章与主文章不共用 ID，多目标引用部分未解析', async () => {
  const [row] = await collectScenario('scoped-ids');
  const view = projectRow(row);
  assert.equal(view.scopes.length, 2);
  const [main,reply] = view.scopes;
  assert.equal(main.scope, null);
  assert.equal(reply.scope, 'reply');
  const mainFig = main.body.find(object => object.id === 'f1');
  const replyFig = reply.body.find(object => object.id === 'f1');
  assert.equal(mainFig.text, '主文图');
  assert.equal(replyFig.text, '子文章图');
  assert.notEqual(mainFig.key, replyFig.key);
  const [relation] = main.relations;
  assert.deepEqual(relation.targets.map(target => [target.rid,target.status]),
    [['f1','resolved'],['f2','unresolved']]);
  assert.equal(relation.targets[0].key, mainFig.key);
  assert.equal(view.availability.relations.unresolved, 1);
  // 显示文字只是显示文字，不成为任何对象的编号
  assert.equal(relation.text, '两图');
  assert.ok(main.body.every(object => object.id !== '两图'));
  assert.ok(!main.body.some(object => object.id === relation.text));
});

test('材料绑定所属文章版本，来源版本差异如实呈现', async () => {
  const [row] = await collectScenario('scoped-ids');
  const [material] = projectRow(row).scopes[0].materials;
  assert.equal(material.status, 'received');
  assert.deepEqual(material.boundTo, {articleId:'a1',version:'v2'});
  assert.equal(material.assetVersion, 'v1');
  assert.equal(material.versionMatches, false);
  assert.equal(material.ownerMatches, true);
  assert.equal(material.hashVerified, null);
});

test('正文取到而材料失败时可用范围真实可见', async () => {
  const [row] = await collectScenario('asset-missing');
  const view = projectRow(row);
  assert.equal(view.availability.body, true);
  assert.deepEqual(view.availability.materials,
    {declared:2,received:1,failed:1,untracked:0,hashFailed:1});
  const [missing,badhash] = view.scopes[0].materials;
  assert.equal(missing.status, 'failed');
  assert.equal(missing.httpStatus, 404);
  assert.equal(missing.boundTo.version, 'v3');
  assert.equal(badhash.status, 'received');
  assert.equal(badhash.hashVerified, false);
  const bibr = view.scopes[0].relations.find(relation => relation.refType === 'bibr');
  assert.equal(bibr.targets[0].status, 'resolved');
  assert.equal(bibr.targets[0].kind, 'ref');
  assert.equal(view.scopes[0].references[0].id, 'r1');
});

test('阅读端经 /projection 看到对象投影与真实可用范围', async () => {
  const rows = await collectScenario('asset-missing');
  const directory = await mkdtemp(join(tmpdir(),'projection-'));
  try {
    const archive = new Archive(directory);
    await archive.put(rows,{source:'local'});
    const api = await createApi(archive);
    try {
      const projection = await (await fetch(`${api.origin}/projection`)).json();
      assert.equal(projection.length, 1);
      assert.equal(projection[0].availability.materials.failed, 1);
      assert.equal(projection[0].availability.body, true);
      assert.equal(typeof projection[0].digest, 'string');
      const records = await (await fetch(`${api.origin}/records`)).json();
      assert.equal(records.length, 1);
      assert.equal(records[0].digest, projection[0].digest);
    } finally { await api.close(); }
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('旧格式原件行投影为正文缺失而非伪造可用', async () => {
  const [view] = projectRows([{row:{id:'a1',title:'t',version:'v1'},digest:'d'}]);
  assert.equal(view.availability.body, false);
  assert.deepEqual(view.scopes, []);
  assert.deepEqual(view.availability.materials,
    {declared:0,received:0,failed:0,untracked:0,hashFailed:0});
});
