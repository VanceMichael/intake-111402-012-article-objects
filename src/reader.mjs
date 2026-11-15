import {createHash} from 'node:crypto';

function nodeId(node) {
  return typeof node.id === 'string' && node.id !== '' ? node.id : null;
}

function* walk(nodes) {
  for (const node of nodes ?? []) {
    yield node;
    yield* walk(node.children);
  }
}

// ID 作用域以 article/subArticle 为界：主文章与每个子文章各自独立。
function scopesOf(article) {
  const scopes = [{scope:null,nodes:[...(article.body ?? []),...(article.back ?? [])]}];
  (article.subArticles ?? []).forEach((sub,index) => {
    scopes.push({scope:typeof sub.articleId === 'string' && sub.articleId !== '' ? sub.articleId : `sub-${index}`,
      nodes:[...(sub.body ?? []),...(sub.back ?? [])]});
  });
  return scopes;
}

// 从声明地址领取一份补充材料；失败时保留失败事实，不伪造成功。
async function fetchMaterial(client,href) {
  try {
    const asset = await client(href);
    const data = typeof asset?.data === 'string' ? asset.data : null;
    const sha256 = typeof asset?.sha256 === 'string' ? asset.sha256 : null;
    let hashVerified = null; // 来源未声明哈希时保持未知
    if (sha256 !== null && data !== null) {
      hashVerified = createHash('sha256').update(Buffer.from(data,'base64')).digest('hex') === sha256.toLowerCase();
    }
    return {status:'received',owner:asset?.owner ?? null,version:asset?.version ?? null,
      mediaType:asset?.mediaType ?? null,data,sha256,hashVerified};
  } catch (error) {
    return {status:'failed',httpStatus:error.status ?? null,reason:String(error.message ?? error)};
  }
}

export async function collect(client) {
  const catalog = await client('/articles');
  const rows = [];
  for (const item of catalog.items) {
    const article = await client(`/articles/${item.articleId}`);
    const materials = [];
    const receipts = new Map();
    for (const {scope,nodes} of scopesOf(article)) {
      for (const node of walk(nodes)) {
        if (node.kind === 'supplementary-material' && typeof node.href === 'string') {
          if (!receipts.has(node.href)) receipts.set(node.href,await fetchMaterial(client,node.href));
          materials.push({scope,id:nodeId(node),href:node.href,...receipts.get(node.href)});
        }
      }
    }
    rows.push({
      id:article.front.articleId,
      title:article.front.title,
      version:article.front.version,
      document:{front:article.front,body:article.body ?? [],back:article.back ?? [],subArticles:article.subArticles ?? []},
      materials
    });
  }
  return rows;
}
