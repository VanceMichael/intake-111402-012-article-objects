# 期刊全文中的引文与附属资料采集

期刊全文接入。已有 front 元数据读取，源站将 JATS XML 保留并提供无损节点投影。

## 运行

Node.js 22.23.4，依赖仅为标准库，package-lock.json 不含网络依赖。无需安装数据库或访问外站。

```sh
npm test
npm run demo
npm start
```

demo 从空临时目录启动来源与查询服务，实际领取并打印收件结果后退出，通常不到 5 秒。持续运行时来源监听 4010，查询服务监听 4020；GET /records 返回已收原件，GET /projection 返回按文章版本推导的阅读视图（对象、引用关系、材料可用范围），GET /health 检查服务。

```sh
docker build --network=none -t article-objects .
docker run --rm --network=none article-objects npm test
docker run --rm --network=none article-objects npm run demo
```

Dockerfile 固定 Node 镜像摘要。首次使用需预载该镜像，运行和测试不下载任何内容。现场演示可执行 npm run demo，在90秒内完成启动、实际收件与查询。

## 工程结构

- src/reader.mjs 是当前来源适配器；不修改来源来迎合适配结果。收取 front/body/back/subArticles 全文投影，并按声明地址领取补充材料，材料收据（收到/失败、哈希校验）随原件行保存。
- src/projection.mjs 从原件行推导阅读视图：对象身份按 文章@版本#作用域/ID 组合，子文章与主文章不共用一套 ID；xref 的 rid 按空格拆分在当前作用域内解析，找不到的目标留作未解析关系，显示文字不当编号；补充材料绑定所属文章版本，正文取到而材料失败时 availability 如实标注。
- src/source.mjs 与 src/behavior.mjs 实现本地来源网关，契约见 contracts.md。
- src/archive.mjs 保存来源与内容摘要；同内容重收不新增，内容变化保留版本。
- src/api.mjs 提供收件与投影查询；.state 为运行状态，停止后可删除恢复空收件箱。
- fixtures/source.json 是虚构来源资料和状态变化，不含真实账号、交易或个人数据。

环境变量 DATA_DIR、PORT、SOURCE_PORT 控制目录和端口；SCENARIO 选择本地来源资料版本。测试和演示自己创建空目录，不依赖上次执行遗留状态。
