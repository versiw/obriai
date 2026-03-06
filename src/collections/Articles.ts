import type { CollectionConfig } from 'payload'

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'url', type: 'text', required: true },
    { name: 'rawContent', type: 'textarea', hidden: true }, // 存储抓取到的原文
    { name: 'source', type: 'relationship', relationTo: 'sources', required: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: '待处理', value: 'pending' },
        { label: '已分析', value: 'processed' },
        { label: '已跳过', value: 'skipped' },
      ],
    },
  ],
}
