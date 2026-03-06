/**
 * @Description: 指定目录生成 AI 上下文脚本 (支持多目录 & 自动复制到剪切板)
 * @Usage: npx tsx scripts/context-gen.ts <path1> <path2> ...
 * @Example: npx tsx scripts/context-gen.ts src/components src/utils/helper.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'

const CONFIG = {
  outputPrefix: 'project_context_',

  // 排除的目录
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
    'releases',
    'tmp',
    'temp'
  ],

  // 排除的文件
  excludedFiles: [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lockb',
    '.DS_Store',
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    'CHANGELOG.md',
    'README.md',
    'LICENSE'
  ],

  // 排除的后缀名
  excludedExtensions: [
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
    '.ppt',
    '.pptx',
    '.zip',
    '.tar',
    '.gz',
    '.7z',
    '.rar',
    '.exe',
    '.dll',
    '.bin',
    '.class',
    '.jar',
    '.o',
    '.so',
    '.eot',
    '.otf',
    '.ttf',
    '.woff',
    '.woff2'
  ],

  // 文件语言映射
  languageMap: {
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
    '.rs': 'rust',
    '.go': 'go',
    '.vue': 'vue',
    '.c': 'c',
    '.cpp': 'cpp'
  } as Record<string, string>
}

function shouldProcessFile(fileName: string): boolean {
  if (fileName.startsWith(CONFIG.outputPrefix)) return false
  if (CONFIG.excludedFiles.includes(fileName)) return false

  const ext = path.extname(fileName).toLowerCase()
  if (CONFIG.excludedExtensions.includes(ext)) return false

  return true
}

function getLanguage(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  return CONFIG.languageMap[ext] || ''
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve) => {
    let command = ''
    let args: string[] = []

    switch (process.platform) {
      case 'win32':
        command = 'powershell'
        args = [
          '-NoProfile',
          '-Command',
          `
          $OutputEncoding = [System.Text.Encoding]::UTF8;
          [Console]::InputEncoding = [System.Text.Encoding]::UTF8;
          $content = [Console]::In.ReadToEnd();
          Set-Clipboard -Value $content;
          `
        ]
        break
      case 'darwin':
        command = 'pbcopy'
        break
      case 'linux':
        command = 'xclip'
        args = ['-selection', 'clipboard']
        break
      default:
        console.warn('⚠️ 当前系统不支持自动复制到剪切板')
        return resolve()
    }

    const child = spawn(command, args)

    child.stdin.write(text, 'utf8')
    child.stdin.end()

    child.on('error', (err) => {
      console.error('❌ 剪切板写入失败:', err.message)
      resolve()
    })

    child.on('close', () => resolve())
  })
}

function generateContextForPath(
  targetPath: string,
  rootDir: string
): { content: string; outputPath: string } | null {
  const fullPath = path.resolve(rootDir, targetPath)

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ 路径不存在，已跳过: ${fullPath}`)
    return null
  }

  const sanitizedName = targetPath
    .replace(/^\.\//, '')
    .replace(/^[\\/]/, '')
    .replace(/[\\/]/g, '_')
    .replace(/^_/, '')
    .replace(/[:*?"<>|]/g, '')

  const fileName = `${CONFIG.outputPrefix}${sanitizedName}.md`
  const outputFilePath = path.join(rootDir, fileName)

  const fileContentBuilder: string[] = []

  fileContentBuilder.push(`# Project Context: ${targetPath}`)
  fileContentBuilder.push(``)
  fileContentBuilder.push(`> Source: ${fullPath}`)
  fileContentBuilder.push(`> Generated: ${new Date().toLocaleString()}`)
  fileContentBuilder.push(``)
  fileContentBuilder.push(`---`)
  fileContentBuilder.push(``)

  const readFile = (filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const relativePath = path.relative(rootDir, filePath)
      const language = getLanguage(filePath)

      if (content.includes('\0')) return

      fileContentBuilder.push(`# File: ${relativePath}`)
      fileContentBuilder.push(``)
      fileContentBuilder.push(`\`\`\`${language}`)
      fileContentBuilder.push(content)
      fileContentBuilder.push('```')
      fileContentBuilder.push(``)
      fileContentBuilder.push(`---`)
      fileContentBuilder.push(``)

      console.log(`  📄 读取: ${relativePath}`)
    } catch (err: unknown) {
      console.error(`  ❌ 读取文件内容出错 ${filePath}:`, getErrorMessage(err))
    }
  }

  const traverse = (currentPath: string) => {
    let entries: string[]
    try {
      const stats = fs.statSync(currentPath)

      if (stats.isFile()) {
        if (shouldProcessFile(path.basename(currentPath))) {
          readFile(currentPath)
        }
        return
      }

      entries = fs.readdirSync(currentPath)
    } catch (err: unknown) {
      console.error(`❌ 读取失败 ${currentPath}:`, getErrorMessage(err))
      return
    }

    entries.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    for (const entry of entries) {
      const entryFullPath = path.join(currentPath, entry)

      try {
        const stats = fs.statSync(entryFullPath)

        if (stats.isDirectory()) {
          if (!CONFIG.excludedDirs.includes(entry)) {
            traverse(entryFullPath)
          }
        } else if (stats.isFile()) {
          if (shouldProcessFile(entry)) {
            readFile(entryFullPath)
          }
        }
      } catch {
        continue
      }
    }
  }

  console.log(`📂 正在处理: ${targetPath}`)
  traverse(fullPath)

  return {
    content: fileContentBuilder.join('\n'),
    outputPath: outputFilePath
  }
}

async function main() {
  const args = process.argv.slice(2)
  const rootDir = process.cwd()

  if (args.length === 0) {
    console.error('❌ 请提供至少一个目标目录或文件路径')
    console.error('👉 示例: npm run context src/components src/utils')
    process.exit(1)
  }

  console.log(`🚀 开始提取上下文...`)
  console.log(`==========================================`)

  let globalClipboardContent = ''
  const generatedFiles: string[] = []

  for (const targetArg of args) {
    const result = generateContextForPath(targetArg, rootDir)

    if (result) {
      try {
        fs.writeFileSync(result.outputPath, result.content, 'utf8')
        generatedFiles.push(result.outputPath)
        console.log(`✅ 已生成文件: ${path.basename(result.outputPath)}`)
      } catch (err: unknown) {
        console.error(`❌ 写入文件失败 ${result.outputPath}:`, getErrorMessage(err))
      }

      if (globalClipboardContent) {
        globalClipboardContent += '\n\n' + '='.repeat(50) + '\n\n'
      }
      globalClipboardContent += result.content
    }
    console.log(`------------------------------------------`)
  }

  if (globalClipboardContent) {
    console.log(`📋 正在写入剪贴板...`)
    await copyToClipboard(globalClipboardContent)
    console.log(`✨ 所有内容已复制到剪贴板！(可直接 Ctrl+V 粘贴给 AI)`)
  } else {
    console.warn(`⚠️ 没有生成有效内容。`)
  }

  console.log(`==========================================`)
  console.log(`🎉 处理完成！共生成 ${generatedFiles.length} 个文档。`)
}

main()
