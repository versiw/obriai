import * as fs from 'fs'
import * as path from 'path'

const CONFIG = {
  outputFile: 'project_context.md',

  excludedDirs: [
    'node_modules',
    '.git',
    '.next',
    '.vscode',
    '.idea',
    'dist',
    'build',
    'coverage',
    'public',
    'releases'
  ],

  excludedFiles: [
    'project_context.md',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lockb',
    '.DS_Store',
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    'generate_context.ts',
    '.gitignore',
    '.prettierignore',
    'CHANGELOG.md',
    'USER_CHANGELOG.md',
    'eslint.config.mjs',
    'next-env.d.ts',
    'README.md',
    'SYSTEM_PROMPT.md',
    'temp.md'
  ],

  excludedExtensions: [
    '.md',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.ico',
    '.webp',
    '.mp4',
    '.mov',
    '.mp3',
    '.wav',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.zip',
    '.tar',
    '.gz',
    '.7z',
    '.rar',
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.bin',
    '.pyc',
    '.class',
    '.jar',
    '.eot',
    '.otf',
    '.ttf',
    '.woff',
    '.woff2'
  ]
}

const rootDir = process.cwd()
const outputFilePath = path.join(rootDir, CONFIG.outputFile)

function shouldProcessFile(fileName: string): boolean {
  if (CONFIG.excludedFiles.includes(fileName)) return false

  const ext = path.extname(fileName).toLowerCase()
  if (CONFIG.excludedExtensions.includes(ext)) return false

  return true
}

function getLanguage(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  const map: Record<string, string> = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.jsx': 'jsx',
    '.json': 'json',
    '.css': 'css',
    '.scss': 'scss',
    '.less': 'less',
    '.html': 'html',
    '.md': 'markdown',
    '.py': 'python',
    '.sh': 'bash',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.sql': 'sql',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.rs': 'rust',
    '.go': 'go'
  }
  return map[ext] || ''
}

function initOutputFile(): void {
  try {
    const header = [
      `# Project Context`,
      ``,
      `> Generated at: ${new Date().toLocaleString()}`,
      ``,
      `---`,
      ``,
      ``
    ].join('\n')

    fs.writeFileSync(outputFilePath, header, 'utf8')
    console.log(`✅ 文件已初始化 (覆盖): ${CONFIG.outputFile}`)
  } catch (error) {
    console.error(`❌ 初始化文件失败:`, error)
    process.exit(1)
  }
}

function appendFileContent(fullPath: string, relativePath: string): void {
  try {
    const content = fs.readFileSync(fullPath, 'utf8')
    const language = getLanguage(relativePath)

    if (content.includes('\0')) {
      console.log(`⚠️ 跳过疑似二进制文件: ${relativePath}`)
      return
    }

    const formattedContent = [
      `# File: ${relativePath}`,
      ``,
      `\`\`\`${language}`,
      content,
      `\`\`\``,
      ``,
      `---`,
      ``,
      ``
    ].join('\n')

    fs.appendFileSync(outputFilePath, formattedContent, 'utf8')
    console.log(`📄 已处理: ${relativePath}`)
  } catch (err: any) {
    console.error(`❌ 读取错误 ${relativePath}:`, err.message)
  }
}

function traverseDirectory(currentPath: string): void {
  let files: string[]
  try {
    files = fs.readdirSync(currentPath)
  } catch (err: any) {
    console.error(`❌ 无法读取目录 ${currentPath}:`, err.message)
    return
  }

  files.sort((a, b) => a.localeCompare(b))

  for (const file of files) {
    const fullPath = path.join(currentPath, file)
    const relativePath = path.relative(rootDir, fullPath)

    let stats: fs.Stats
    try {
      stats = fs.statSync(fullPath)
    } catch (err) {
      continue
    }

    if (stats.isDirectory()) {
      if (!CONFIG.excludedDirs.includes(file)) {
        traverseDirectory(fullPath)
      }
    } else if (stats.isFile()) {
      if (shouldProcessFile(file)) {
        appendFileContent(fullPath, relativePath)
      }
    }
  }
}

function main() {
  console.log('🚀 开始生成项目上下文...')
  console.log(`📂 根目录: ${rootDir}`)

  initOutputFile()

  traverseDirectory(rootDir)

  console.log('==========================================')
  console.log('🎉 完成！')
  console.log(`👉 生成文件位置: ${outputFilePath}`)
}

main()
