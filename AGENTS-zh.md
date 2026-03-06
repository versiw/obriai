# Payload CMS 开发规范

你是一名 Payload CMS 专家级开发者。在处理 Payload 项目时，请遵循以下规则：

## 核心原则

1. **TypeScript 优先**：始终使用 TypeScript 并使用 Payload 提供的正确类型
2. **安全至上**：遵循所有安全模式，尤其是访问控制
3. **类型生成**：在更改 schema 后运行 `generate:types` 脚本
4. **事务安全**：在钩子（hooks）的嵌套操作中始终传递 `req`
5. **访问控制**：要明白本地 API（Local API）默认会绕过访问控制
6. **访问控制**：在修改具有访问控制的集合（collection）或全局配置（globals）时，确保角色（roles）存在

### 代码验证

- 修改代码后，运行 `tsc --noEmit` 来验证 TypeScript 的正确性
- 创建或修改组件后，生成导入映射（import maps）。

## 项目结构

```
src/
├── app/
│   ├── (frontend)/          # 前端路由
│   └── (payload)/           # Payload 管理后台路由
├── collections/             # 集合配置
├── globals/                 # 全局配置
├── components/              # 自定义 React 组件
├── hooks/                   # 钩子函数
├── access/                  # 访问控制函数
└── payload.config.ts        # 主配置文件
```

## 配置

### 最小化配置模式

```typescript
import { buildConfig } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: 'users',
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URL,
  }),
})
```

## 集合 (Collections)

### 基础集合

```typescript
import type { CollectionConfig } from 'payload'

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'author', 'status', 'createdAt'],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', unique: true, index: true },
    { name: 'content', type: 'richText' },
    { name: 'author', type: 'relationship', relationTo: 'users' },
  ],
  timestamps: true,
}
```

### 带有 RBAC 的 Auth（认证）集合

```typescript
export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: ['admin', 'editor', 'user'],
      defaultValue: ['user'],
      required: true,
      saveToJWT: true, // 包含在 JWT 中以便进行快速的访问检查
      access: {
        update: ({ req: { user } }) => user?.roles?.includes('admin'),
      },
    },
  ],
}
```

## 字段 (Fields)

### 常见模式

```typescript
// 自动生成 slugs
import { slugField } from 'payload'
slugField({ fieldToUse: 'title' })

// 带有过滤条件的关系字段
{
  name: 'category',
  type: 'relationship',
  relationTo: 'categories',
  filterOptions: { active: { equals: true } },
}

// 条件字段
{
  name: 'featuredImage',
  type: 'upload',
  relationTo: 'media',
  admin: {
    condition: (data) => data.featured === true,
  },
}

// 虚拟字段
{
  name: 'fullName',
  type: 'text',
  virtual: true,
  hooks: {
    afterRead:[({ siblingData }) => `${siblingData.firstName} ${siblingData.lastName}`],
  },
}
```

## 致命安全模式（CRITICAL SECURITY PATTERNS）

### 1. 本地 API 访问控制（最重要）

```typescript
// ❌ 安全漏洞：访问控制被绕过
await payload.find({
  collection: 'posts',
  user: someUser, // 被忽略！操作以 ADMIN 权限运行
})

// ✅ 安全：强制执行用户权限
await payload.find({
  collection: 'posts',
  user: someUser,
  overrideAccess: false, // 必须项
})

// ✅ 管理操作（有意绕过）
await payload.find({
  collection: 'posts',
  // 没有 user，overrideAccess 默认为 true
})
```

**规则**：当向本地 API 传递 `user` 时，**始终**设置 `overrideAccess: false`

### 2. 钩子中的事务安全

```typescript
// ❌ 数据损坏风险：独立的事务
hooks: {
  afterChange:[
    async ({ doc, req }) => {
      await req.payload.create({
        collection: 'audit-log',
        data: { docId: doc.id },
        // 缺少 req - 在独立的事务中运行！
      })
    },
  ],
}

// ✅ 原子性：在同一个事务中
hooks: {
  afterChange:[
    async ({ doc, req }) => {
      await req.payload.create({
        collection: 'audit-log',
        data: { docId: doc.id },
        req, // 保持原子性
      })
    },
  ],
}
```

**规则**：**始终**将 `req` 传递给钩子中的嵌套操作

### 3. 防止钩子无限循环

```typescript
// ❌ 无限循环
hooks: {
  afterChange:[
    async ({ doc, req }) => {
      await req.payload.update({
        collection: 'posts',
        id: doc.id,
        data: { views: doc.views + 1 },
        req,
      }) // 会再次触发 afterChange！
    },
  ],
}

// ✅ 安全：使用 context 标志位
hooks: {
  afterChange:[
    async ({ doc, req, context }) => {
      if (context.skipHooks) return

      await req.payload.update({
        collection: 'posts',
        id: doc.id,
        data: { views: doc.views + 1 },
        context: { skipHooks: true },
        req,
      })
    },
  ],
}
```

## 访问控制 (Access Control)

### 集合级访问控制

```typescript
import type { Access } from 'payload'

// 返回布尔值
const authenticated: Access = ({ req: { user } }) => Boolean(user)

// 查询约束（行级安全）
const ownPostsOnly: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user?.roles?.includes('admin')) return true

  return {
    author: { equals: user.id },
  }
}

// 异步访问检查
const projectMemberAccess: Access = async ({ req, id }) => {
  const { user, payload } = req

  if (!user) return false
  if (user.roles?.includes('admin')) return true

  const project = await payload.findByID({
    collection: 'projects',
    id: id as string,
    depth: 0,
  })

  return project.members?.includes(user.id)
}
```

### 字段级访问控制

```typescript
// 字段级访问只能返回布尔值（不支持查询约束）
{
  name: 'salary',
  type: 'number',
  access: {
    read: ({ req: { user }, doc }) => {
      // 本人可以读取自己的薪资
      if (user?.id === doc?.id) return true
      // 管理员可以读取所有
      return user?.roles?.includes('admin')
    },
    update: ({ req: { user } }) => {
      // 只有管理员可以更新
      return user?.roles?.includes('admin')
    },
  },
}
```

### 常见访问控制模式

```typescript
// 任何人
export const anyone: Access = () => true

// 仅限已认证用户
export const authenticated: Access = ({ req: { user } }) => Boolean(user)

// 仅限管理员
export const adminOnly: Access = ({ req: { user } }) => {
  return user?.roles?.includes('admin')
}

// 管理员或本人
export const adminOrSelf: Access = ({ req: { user } }) => {
  if (user?.roles?.includes('admin')) return true
  return { id: { equals: user?.id } }
}

// 已发布或已认证用户
export const authenticatedOrPublished: Access = ({ req: { user } }) => {
  if (user) return true
  return { _status: { equals: 'published' } }
}
```

## 钩子 (Hooks)

### 常见钩子模式

```typescript
import type { CollectionConfig } from 'payload'

export const Posts: CollectionConfig = {
  slug: 'posts',
  hooks: {
    // 验证前 - 格式化数据
    beforeValidate: [
      async ({ data, operation }) => {
        if (operation === 'create') {
          data.slug = slugify(data.title)
        }
        return data
      },
    ],

    // 保存前 - 业务逻辑
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        if (operation === 'update' && data.status === 'published') {
          data.publishedAt = new Date()
        }
        return data
      },
    ],

    // 保存后 - 副作用
    afterChange: [
      async ({ doc, req, operation, previousDoc, context }) => {
        // 检查 context 以防止无限循环
        if (context.skipNotification) return

        if (operation === 'create') {
          await sendNotification(doc)
        }
        return doc
      },
    ],

    // 读取后 - 计算字段
    afterRead: [
      async ({ doc, req }) => {
        doc.viewCount = await getViewCount(doc.id)
        return doc
      },
    ],

    // 删除前 - 级联删除
    beforeDelete: [
      async ({ req, id }) => {
        await req.payload.delete({
          collection: 'comments',
          where: { post: { equals: id } },
          req, // 对事务很重要
        })
      },
    ],
  },
}
```

## 查询 (Queries)

### 本地 API (Local API)

```typescript
// 使用复杂查询查找
const posts = await payload.find({
  collection: 'posts',
  where: {
    and: [{ status: { equals: 'published' } }, { 'author.name': { contains: 'john' } }],
  },
  depth: 2, // 填充关联关系
  limit: 10,
  sort: '-createdAt',
  select: {
    title: true,
    author: true,
  },
})

// 通过 ID 查找
const post = await payload.findByID({
  collection: 'posts',
  id: '123',
  depth: 2,
})

// 创建
const newPost = await payload.create({
  collection: 'posts',
  data: {
    title: 'New Post',
    status: 'draft',
  },
})

// 更新
await payload.update({
  collection: 'posts',
  id: '123',
  data: { status: 'published' },
})

// 删除
await payload.delete({
  collection: 'posts',
  id: '123',
})
```

### 查询操作符

```typescript
// 等于
{ status: { equals: 'published' } }

// 不等于
{ status: { not_equals: 'draft' } }

// 大于 / 小于
{ price: { greater_than: 100 } }
{ age: { less_than_equal: 65 } }

// 包含（大小写不敏感）
{ title: { contains: 'payload' } }

// Like（存在所有单词）
{ description: { like: 'cms headless' } }

// 在数组中
{ category: { in:['tech', 'news'] } }

// 存在
{ image: { exists: true } }

// Near（地理空间查询）
{ location: { near:[-122.4194, 37.7749, 10000] } }
```

### AND/OR 逻辑

```typescript
{
  or:[
    { status: { equals: 'published' } },
    { author: { equals: user.id } },
  ],
}

{
  and:[
    { status: { equals: 'published' } },
    { featured: { equals: true } },
  ],
}
```

## 获取 Payload 实例

```typescript
// 在 API 路由中 (Next.js)
import { getPayload } from 'payload'
import config from '@payload-config'

export async function GET() {
  const payload = await getPayload({ config })

  const posts = await payload.find({
    collection: 'posts',
  })

  return Response.json(posts)
}

// 在 Server Components (服务端组件) 中
import { getPayload } from 'payload'
import config from '@payload-config'

export default async function Page() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'posts' })

  return <div>{docs.map(post => <h1 key={post.id}>{post.title}</h1>)}</div>
}
```

## 组件 (Components)

可以使用 React 组件对管理后台（Admin Panel）进行广泛的自定义。自定义组件可以是服务端组件（Server Components，默认）或客户端组件（Client Components）。

### 定义组件

在配置中，组件是使用**文件路径**（而不是直接导入）来定义的：

**组件路径规则：**

- 路径相对于项目根目录或 `config.admin.importMap.baseDir`
- 命名导出（Named exports）：使用 `#ExportName` 后缀或 `exportName` 属性
- 默认导出（Default exports）：不需要后缀
- 可以省略文件扩展名

```typescript
import { buildConfig } from 'payload'

export default buildConfig({
  admin: {
    components: {
      // Logo 和品牌形象
      graphics: {
        Logo: '/components/Logo',
        Icon: '/components/Icon',
      },

      // 导航
      Nav: '/components/CustomNav',
      beforeNavLinks: ['/components/CustomNavItem'],
      afterNavLinks: ['/components/NavFooter'],

      // 头部
      header: ['/components/AnnouncementBanner'],
      actions: ['/components/ClearCache', '/components/Preview'],

      // 仪表盘
      beforeDashboard: ['/components/WelcomeMessage'],
      afterDashboard: ['/components/Analytics'],

      // 认证
      beforeLogin: ['/components/SSOButtons'],
      logout: { Button: '/components/LogoutButton' },

      // 设置
      settingsMenu: ['/components/SettingsMenu'],

      // 视图
      views: {
        dashboard: { Component: '/components/CustomDashboard' },
      },
    },
  },
})
```

**组件路径规则：**

- 路径相对于项目根目录或 `config.admin.importMap.baseDir`
- 命名导出（Named exports）：使用 `#ExportName` 后缀或 `exportName` 属性
- 默认导出（Default exports）：不需要后缀
- 可以省略文件扩展名

### 组件类型

1. **根组件 (Root Components)** - 全局管理面板（logo、导航、头部）
2. **集合组件 (Collection Components)** - 针对特定集合（编辑视图、列表视图）
3. **全局配置组件 (Global Components)** - 全局文档视图
4. **字段组件 (Field Components)** - 自定义字段 UI 和表格单元格

### 组件类型

1. **根组件 (Root Components)** - 全局管理面板（logo、导航、头部）
2. **集合组件 (Collection Components)** - 针对特定集合（编辑视图、列表视图）
3. **全局配置组件 (Global Components)** - 全局文档视图
4. **字段组件 (Field Components)** - 自定义字段 UI 和表格单元格

### 服务端组件 vs 客户端组件

**默认情况下，所有组件都是服务端组件**（可以直接使用本地 API）：

```tsx
// 服务端组件（默认）
import type { Payload } from 'payload'

async function MyServerComponent({ payload }: { payload: Payload }) {
  const posts = await payload.find({ collection: 'posts' })
  return <div>{posts.totalDocs} posts</div>
}

export default MyServerComponent
```

**客户端组件**需要添加 `'use client'` 指令：

```tsx
'use client'
import { useState } from 'react'
import { useAuth } from '@payloadcms/ui'

export function MyClientComponent() {
  const [count, setCount] = useState(0)
  const { user } = useAuth()

  return (
    <button onClick={() => setCount(count + 1)}>
      {user?.email}: Clicked {count} times
    </button>
  )
}
```

### 使用 Hooks（仅限客户端组件）

```tsx
'use client'
import {
  useAuth, // 当前用户
  useConfig, // Payload 配置（客户端安全）
  useDocumentInfo, // 文档信息（id、collection 等）
  useField, // 字段值和 setter
  useForm, // 表单状态
  useFormFields, // 多个字段值（已优化）
  useLocale, // 当前语言环境
  useTranslation, // i18n 翻译
  usePayload, // 本地 API 方法
} from '@payloadcms/ui'

export function MyComponent() {
  const { user } = useAuth()
  const { config } = useConfig()
  const { id, collection } = useDocumentInfo()
  const locale = useLocale()
  const { t } = useTranslation()

  return <div>Hello {user?.email}</div>
}
```

### 集合/全局组件

```typescript
export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    components: {
      // 编辑视图
      edit: {
        PreviewButton: '/components/PostPreview',
        SaveButton: '/components/CustomSave',
        SaveDraftButton: '/components/SaveDraft',
        PublishButton: '/components/Publish',
      },

      // 列表视图
      list: {
        Header: '/components/ListHeader',
        beforeList: ['/components/BulkActions'],
        afterList: ['/components/ListFooter'],
      },
    },
  },
}
```

### 字段组件

```typescript
{
  name: 'status',
  type: 'select',
  options:['draft', 'published'],
  admin: {
    components: {
      // 编辑视图字段
      Field: '/components/StatusField',
      // 列表视图单元格
      Cell: '/components/StatusCell',
      // 字段标签
      Label: '/components/StatusLabel',
      // 字段描述
      Description: '/components/StatusDescription',
      // 错误信息
      Error: '/components/StatusError',
    },
  },
}
```

**UI 字段**（仅用于展示，不包含数据）：

```typescript
{
  name: 'refundButton',
  type: 'ui',
  admin: {
    components: {
      Field: '/components/RefundButton',
    },
  },
}
```

### 性能最佳实践

1. **正确导入：**
   - 管理后台: `import { Button } from '@payloadcms/ui'`
   - 前端: `import { Button } from '@payloadcms/ui/elements/Button'`

2. **优化重渲染：**

   ```tsx
   // ❌ 错误做法：表单任何变化都会导致重渲染
   const { fields } = useForm()

   // ✅ 正确做法：只有特定字段变化时才重渲染
   const value = useFormFields(([fields]) => fields[path])
   ```

3. **优先使用服务端组件** - 仅在需要以下功能时使用客户端组件：
   - 状态 (useState, useReducer)
   - 副作用 (useEffect)
   - 事件处理器 (onClick, onChange)
   - 浏览器 API (localStorage, window)

4. **最小化序列化 props** - 服务端组件会序列化发送给客户端的 props

### 样式化组件

```tsx
import './styles.scss'

export function MyComponent() {
  return <div className="my-component">Content</div>
}
```

```scss
// 使用 Payload 的 CSS 变量
.my-component {
  background-color: var(--theme-elevation-500);
  color: var(--theme-text);
  padding: var(--base);
  border-radius: var(--border-radius-m);
}

// 导入 Payload 的 SCSS 库
@import '~@payloadcms/ui/scss';

.my-component {
  @include mid-break {
    background-color: var(--theme-elevation-900);
  }
}
```

### 类型安全

```tsx
import type {
  TextFieldServerComponent,
  TextFieldClientComponent,
  TextFieldCellComponent,
  SelectFieldServerComponent,
  // ... 等等
} from 'payload'

export const MyField: TextFieldClientComponent = (props) => {
  // 完全类型化的 props
}
```

### Import Map (导入映射)

Payload 会自动生成 `app/(payload)/admin/importMap.js` 来解析组件路径。

**手动重新生成：**

```bash
payload generate:importmap
```

**设置自定义位置：**

```typescript
export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname, 'src'),
      importMapFile: path.resolve(dirname, 'app', 'custom-import-map.js'),
    },
  },
})
```

## 自定义端点 (Custom Endpoints)

```typescript
import type { Endpoint } from 'payload'
import { APIError } from 'payload'

// 始终检查身份验证
export const protectedEndpoint: Endpoint = {
  path: '/protected',
  method: 'get',
  handler: async (req) => {
    if (!req.user) {
      throw new APIError('Unauthorized', 401)
    }

    // 使用 req.payload 进行数据库操作
    const data = await req.payload.find({
      collection: 'posts',
      where: { author: { equals: req.user.id } },
    })

    return Response.json(data)
  },
}

// 路由参数
export const trackingEndpoint: Endpoint = {
  path: '/:id/tracking',
  method: 'get',
  handler: async (req) => {
    const { id } = req.routeParams

    const tracking = await getTrackingInfo(id)

    if (!tracking) {
      return Response.json({ error: 'not found' }, { status: 404 })
    }

    return Response.json(tracking)
  },
}
```

## 草稿与版本 (Drafts & Versions)

```typescript
export const Pages: CollectionConfig = {
  slug: 'pages',
  versions: {
    drafts: {
      autosave: true,
      schedulePublish: true,
      validate: false, // 不验证草稿
    },
    maxPerDoc: 100,
  },
  access: {
    read: ({ req: { user } }) => {
      // 公众只能看到已发布的内容
      if (!user) return { _status: { equals: 'published' } }
      // 认证用户可以看到所有内容
      return true
    },
  },
}

// 创建草稿
await payload.create({
  collection: 'pages',
  data: { title: 'Draft Page' },
  draft: true, // 跳过必填项验证
})

// 读取包含草稿的内容
const page = await payload.findByID({
  collection: 'pages',
  id: '123',
  draft: true, // 如果有草稿则返回草稿
})
```

## 字段类型守卫 (Field Type Guards)

```typescript
import {
  fieldAffectsData,
  fieldHasSubFields,
  fieldIsArrayType,
  fieldIsBlockType,
  fieldSupportsMany,
  fieldHasMaxDepth,
} from 'payload'

function processField(field: Field) {
  // 检查字段是否存储数据
  if (fieldAffectsData(field)) {
    console.log(field.name) // 可以安全访问
  }

  // 检查字段是否有嵌套字段
  if (fieldHasSubFields(field)) {
    field.fields.forEach(processField) // 可以安全访问
  }

  // 检查字段类型
  if (fieldIsArrayType(field)) {
    console.log(field.minRows, field.maxRows)
  }

  // 检查功能特性
  if (fieldSupportsMany(field) && field.hasMany) {
    console.log('Multiple values supported') // 支持多个值
  }
}
```

## 插件 (Plugins)

### 使用插件

```typescript
import { seoPlugin } from '@payloadcms/plugin-seo'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'

export default buildConfig({
  plugins: [
    seoPlugin({
      collections: ['posts', 'pages'],
    }),
    redirectsPlugin({
      collections: ['pages'],
    }),
  ],
})
```

### 创建插件

```typescript
import type { Config, Plugin } from 'payload'

interface MyPluginConfig {
  collections?: string[]
  enabled?: boolean
}

export const myPlugin =
  (options: MyPluginConfig): Plugin =>
  (config: Config): Config => ({
    ...config,
    collections: config.collections?.map((collection) => {
      if (options.collections?.includes(collection.slug)) {
        return {
          ...collection,
          fields: [...collection.fields, { name: 'pluginField', type: 'text' }],
        }
      }
      return collection
    }),
  })
```

## 最佳实践

### 安全

1. 向本地 API 传递 `user` 时，始终设置 `overrideAccess: false`
2. 字段级访问控制只返回布尔值（没有查询约束）
3. 默认使用严格的访问控制，逐步添加权限
4. 永远不要信任客户端提供的数据
5. 对角色使用 `saveToJWT: true` 以避免数据库查询

### 性能

1. 为频繁查询的字段添加索引
2. 使用 `select` 限制返回的字段
3. 在关系字段上设置 `maxDepth` 以防止过度获取数据
4. 在访问控制中，优先使用查询约束而不是异步操作
5. 在 `req.context` 中缓存高昂的操作

### 数据完整性

1. 在钩子的嵌套操作中始终传递 `req`
2. 使用 context 标志位防止钩子无限循环
3. 为 MongoDB（需要副本集）和 Postgres 启用事务
4. 使用 `beforeValidate` 进行数据格式化
5. 使用 `beforeChange` 处理业务逻辑

### 类型安全

1. 更改 schema 后运行 `generate:types`
2. 从生成的 `payload-types.ts` 中导入类型
3. 为 user 对象指定类型：`import type { User } from '@/payload-types'`
4. 为字段选项（options）使用 `as const`
5. 使用字段类型守卫进行运行时类型检查

### 组织结构

1. 将集合保存在单独的文件中
2. 将访问控制逻辑提取到 `access/` 目录
3. 将钩子提取到 `hooks/` 目录
4. 为常见模式使用可重用的字段工厂函数
5. 使用注释记录复杂的访问控制逻辑

## 常见坑点 (Common Gotchas)

1. **本地 API 默认行为**：除非设置 `overrideAccess: false`，否则会绕过访问控制
2. **事务安全**：嵌套操作中缺少 `req` 会破坏原子性
3. **钩子循环**：钩子中的操作可能会触发相同的钩子
4. **字段访问控制**：不能使用查询约束，只能返回布尔值
5. **关系深度**：默认深度为 2，如果只需要 ID 则设置为 0
6. **草稿状态**：启用草稿功能时，会自动注入 `_status` 字段
7. **类型生成**：只有运行 `generate:types` 后类型才会更新
8. **MongoDB 事务**：需要配置副本集
9. **SQLite 事务**：默认禁用，通过 `transactionOptions: {}` 启用
10. **Point 字段**：SQLite 不支持

## 附加的上下文文件

要深入了解特定主题，请参考位于 `.cursor/rules/` 目录下的上下文文件：

### 可用的上下文文件

1. **`payload-overview.md`** - 高级架构和核心概念
   - Payload 结构与初始化
   - 配置基础
   - 数据库适配器概览

2. **`security-critical.md`** - 致命安全模式 (⚠️ 重要)
   - 本地 API 访问控制
   - 钩子中的事务安全
   - 防止钩子无限循环

3. **`collections.md`** - 集合配置
   - 基础集合模式
   - 带有 RBAC 的 Auth 集合
   - 上传集合
   - 草稿与版本控制
   - 全局配置 (Globals)

4. **`fields.md`** - 字段类型与模式
   - 所有字段类型及示例
   - 条件字段
   - 虚拟字段
   - 字段验证
   - 常见字段模式

5. **`field-type-guards.md`** - TypeScript 字段类型工具
   - 字段类型检查工具
   - 安全的类型收窄
   - 运行时字段验证

6. **`access-control.md`** - 权限模式
   - 集合级访问控制
   - 字段级访问控制
   - 行级安全
   - RBAC 模式
   - 多租户访问控制

7. **`access-control-advanced.md`** - 复杂访问模式
   - 嵌套文档访问控制
   - 跨集合权限
   - 动态角色层级
   - 性能优化

8. **`hooks.md`** - 生命周期钩子
   - 集合钩子
   - 字段钩子
   - 钩子上下文模式
   - 常见钩子配方/用法

9. **`queries.md`** - 数据库操作
   - 本地 API 用法
   - 查询操作符
   - 使用 AND/OR 的复杂查询
   - 性能优化

10. **`endpoints.md`** - 自定义 API 端点
    - REST 端点模式
    - 端点中的身份验证
    - 错误处理
    - 路由参数

11. **`adapters.md`** - 数据库与存储适配器
    - MongoDB、PostgreSQL、SQLite 模式
    - 存储适配器用法（S3、Azure、GCS 等）
    - 自定义适配器开发

12. **`plugin-development.md`** - 创建插件
    - 插件架构
    - 修改配置
    - 插件钩子
    - 最佳实践

13. **`components.md`** - 自定义组件
    - 组件类型（根、集合、全局、字段）
    - 服务端组件 vs 客户端组件
    - 组件路径与定义
    - 默认与自定义 props
    - 使用 Hooks
    - 性能最佳实践
    - 样式化组件

## 资源 (Resources)

- 文档: https://payloadcms.com/docs
- LLM 上下文: https://payloadcms.com/llms-full.txt
- GitHub: https://github.com/payloadcms/payload
- 示例 (Examples): https://github.com/payloadcms/payload/tree/main/examples
- 模板 (Templates): https://github.com/payloadcms/payload/tree/main/templates
