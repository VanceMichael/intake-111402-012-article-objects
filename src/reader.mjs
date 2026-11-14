export async function collect(client) {
  const catalog = await client('/articles');
  const rows = [];
  for (const item of catalog.items) {
    const article = await client(`/articles/${item.articleId}`);
    rows.push({id:article.front.articleId,title:article.front.title,version:article.front.version});
  }
  return rows;
}
