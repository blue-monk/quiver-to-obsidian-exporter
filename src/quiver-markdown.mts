import fg from 'fast-glob'
import fs from 'fs-extra'
import path from 'path'
import TurndownService from './transform/turndown-service.mjs'
import { formatTime } from './transform/formatter.mjs'
import { processMarkdownImage } from './transform/image-link-transform.mjs'


export function convert (qvlibrary: string, outputPath: string) {
  const glob = path.join(qvlibrary, '*.qvnotebook')
  const noteBooks = fg.sync(glob, { onlyDirectories: true })


  for (const notebook of noteBooks) {
    convertNotebook(notebook, outputPath)
  }
}


export function convertNotebook (notebook: string, outputPath: string) {
  const notebookMeta = JSON.parse(fs.readFileSync(path.join(notebook, 'meta.json'), 'utf8'))

  const glob = path.join(notebook, '*.qvnote')
  const notes = fg.sync(glob, { onlyDirectories: true })

  const notebookOutputPath = path.join(outputPath, notebookMeta.name)
  const notebookResourcePath = path.join(notebookOutputPath, `./_resources`)

  fs.ensureDirSync(notebookOutputPath)
  fs.ensureDirSync(notebookResourcePath)
  
  for (const note of notes) {
    const { title, content } = convertNoteToMarkdown(note)

    const fileName = path.join(notebookOutputPath, `${title}.md`)
    try {
      fs.writeFileSync(fileName, content)
  
      const notebookResourceDir = path.join(note, 'resources')
      if (fs.pathExistsSync(notebookResourceDir)) {
        // copy every file under resources to notebook resource dir
        const files = fg.sync(path.join(notebookResourceDir, '**/*'))
        for (const file of files) {
          const fileName = path.basename(file)
          const dest = path.join(notebookResourcePath, fileName)
          fs.copySync(file, dest)
        }
      }
    } catch (e) {
      console.error(e)
      console.error(`Invalid file name ${fileName}`)
    }
  }
}

export function convertNoteToMarkdown (note: string): { title: string, content: string } {
  const meta = JSON.parse(fs.readFileSync(path.join(note, 'meta.json'), 'utf8'))
  const content = JSON.parse(fs.readFileSync(path.join(note, 'content.json'), 'utf8'))

  const tags = meta.tags.length > 0 ? meta.tags.map(t => `#${t}`).join(' ') + '\n\n' : ''

  const cellsToMarkdown = content.cells.map(cell => {
    switch(cell.type) {
      case 'text':
        return TurndownService.turndown(cell.data)
      case 'code':
        return `\`\`\`${cell.language}\n${cell.data}\n\`\`\``
      case 'markdown':
        return processMarkdownImage(cell.data)
      case 'diagram':
        return `\`\`\`${cell.diagramType}\n${cell.data}\n\`\`\``
      case 'latex':
        return `$$\n${cell.data}\n$$`
      default:
        throw new Error(`Unknown cell type: ${cell.type}`)
    }
  }).join('\n\n')

  return {
    title: meta.title,
    content: `${tags}${cellsToMarkdown}

    Created At: ${formatTime(meta.created_at * 1000)}
    Updated At: ${formatTime(meta.updated_at * 1000)}
  `
  }
}
