// 业务投影：从归档原件行推导阅读端视图。
// 原件归档本身不决定引用是否已解析、材料是否可用；这些判断只发生在本模块。

function nodeId(node) {
  return typeof node.id === 'string' && node.id !== '' ? node.id : null;
}

// 对象身份 = 文章 + 版本 + 作用域 + 局部 ID；子文章不与主文章共用一套 ID。
function keyOf(articleId,version,scope,id) {
  return `${articleId}@${version}#${scope === null ? '' : `${scope}/`}${id}`;
}

function receiptKey(scope,id,href) {
  return `${String(scope)}${String(id)}${href}`;
}

function materialView(articleId,version,scope,id,href,receipt) {
  const base = {key:id === null ? null : keyOf(articleId,version,scope,id),id,href,
    boundTo:{articleId,version}};
  if (receipt === undefined) return {...base,status:'untracked'}; // 有声明无领取记录
  if (receipt.status === 'failed') {
    return {...base,status:'failed',httpStatus:receipt.httpStatus,reason:receipt.reason};
  }
  return {...base,status:'received',
    owner:receipt.owner,assetVersion:receipt.version,
    ownerMatches:receipt.owner === articleId,versionMatches:receipt.version === version,
    mediaType:receipt.mediaType,sha256:receipt.sha256,hashVerified:receipt.hashVerified,
    data:receipt.data};
}

function collectScope(articleId,version,scope,body,back,receipts) {
  const objects = new Map();
  const order = [];
  const relations = [];
  const materials = [];
  const visit = (node,parent,place) => {
    const id = nodeId(node);
    if (id !== null && !objects.has(id)) {
      const object = {key:keyOf(articleId,version,scope,id),id,kind:node.kind ?? null,
        text:node.text ?? null,parent,place};
      objects.set(id,object);
      order.push(object);
    }
    if (node.kind === 'supplementary-material' && typeof node.href === 'string') {
      materials.push(materialView(articleId,version,scope,id,node.href,
        receipts.get(receiptKey(scope,id,node.href))));
    }
    if (node.kind === 'xref') {
      // rid 是空格分隔的 IDREFS：一条引用可同时指向多个对象。
      // text 只是显示文字，绝不当作目标编号使用。
      const rids = typeof node.rid === 'string' ? node.rid.split(/\s+/).filter(Boolean) : [];
      relations.push({refType:node.refType ?? null,text:node.text ?? null,from:id ?? parent,
        targets:rids.map(rid => ({rid}))});
    }
    for (const child of node.children ?? []) visit(child,id ?? parent,place);
  };
  for (const node of body ?? []) visit(node,null,'body');
  for (const node of back ?? []) visit(node,null,'back');
  // 只在当前作用域内按 ID 解析；找不到的目标留作未解析关系。
  for (const relation of relations) {
    relation.targets = relation.targets.map(({rid}) => {
      const object = objects.get(rid);
      if (object === undefined) return {rid,status:'unresolved'};
      return {rid,status:'resolved',key:object.key,kind:object.kind};
    });
  }
  return {scope,
    body:order.filter(object => object.place === 'body'),
    references:order.filter(object => object.place === 'back'),
    relations,materials};
}

export function projectRow(row) {
  const document = row.document ?? null;
  const articleId = row.id;
  const version = row.version ?? null;
  const receipts = new Map();
  for (const receipt of row.materials ?? []) {
    receipts.set(receiptKey(receipt.scope,receipt.id,receipt.href),receipt);
  }
  const scopes = [];
  if (document !== null) {
    scopes.push(collectScope(articleId,version,null,document.body,document.back,receipts));
    (document.subArticles ?? []).forEach((sub,index) => {
      const scope = typeof sub.articleId === 'string' && sub.articleId !== '' ? sub.articleId : `sub-${index}`;
      scopes.push(collectScope(articleId,version,scope,sub.body,sub.back,receipts));
    });
  }
  const materials = scopes.flatMap(scope => scope.materials);
  const targets = scopes.flatMap(scope => scope.relations).flatMap(relation => relation.targets);
  const resolved = targets.filter(target => target.status === 'resolved').length;
  return {
    articleId,version,title:row.title ?? null,
    scopes,
    availability:{
      body:document !== null,
      objects:scopes.flatMap(scope => scope.body).length,
      references:scopes.flatMap(scope => scope.references).length,
      relations:{targets:targets.length,resolved,unresolved:targets.length - resolved},
      materials:{
        declared:materials.length,
        received:materials.filter(material => material.status === 'received').length,
        failed:materials.filter(material => material.status === 'failed').length,
        untracked:materials.filter(material => material.status === 'untracked').length,
        hashFailed:materials.filter(material => material.status === 'received' && material.hashVerified === false).length
      }
    }
  };
}

export function projectRows(entries) {
  return entries.map(entry => ({digest:entry.digest ?? null,...projectRow(entry.row)}));
}
