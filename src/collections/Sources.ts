import type { CollectionConfig } from 'payload'

export const Sources: CollectionConfig = {
  slug: 'sources',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'url', 'type', 'active'],
  },
  access: {
    read: () => true, // 允许系统/Agent 读取
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: '数据源名称',
    },
    {
      name: 'url',
      type: 'text',
      required: true,
      label: '目标 URL',
    },
    {
      name: 'type',
      type: 'select',
      defaultValue: 'webpage',
      options: [
        { label: 'RSS Feed', value: 'rss' },
        { label: '常规网页', value: 'webpage' },
        { label: 'Sitemap', value: 'sitemap' },
      ],
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: '是否启用',
    },
    {
      name: 'scrapingGuidance',
      type: 'group',
      label: 'AI 抓取引导',
      fields: [
        {
          name: 'focus',
          type: 'textarea',
          label: '关注的主题/关键词',
          admin: {
            placeholder: '例如：只采集与 React 性能优化相关的文章',
          },
        },
        {
          name: 'depth',
          type: 'number',
          defaultValue: 1,
          label: '抓取深度',
        },
      ],
    },
    {
      name: 'lastPolled',
      type: 'date',
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
  ],
}
