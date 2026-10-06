import { spawn } from 'child_process'
import path from 'path'

// Keep the command out of a single string so the Next.js build does not
// follow the local podcast/bin/python3 shortcut outside the project.
const pythonCommand = process.env.PYTHON_BIN || ['python', '3'].join('')

export class ProcessError extends Error {
  constructor(message, exitcode) {
    super(message)
    this.name = 'ProcessError'
    this.exitcode = exitcode
  }
}

export default function python(pathspec, args, callback) {
  return new Promise((resolve, reject) => {
    let stdin
    try {
      stdin = JSON.stringify(args)
    } catch (e) {
      throw new ProcessError(`Process input could not be serialized`, null)
    }
    const proc = spawn(pythonCommand, [
      '-u',
      path.join(process.env.PYTHON_ROOT || '', 'src', 'utils', 'helper.py'),
      pathspec,
    ], { env: { ...process.env, PYTHONUNBUFFERED: '1' } })
    let stdout = ''
    proc.stdout.on('data', (chunk) => { stdout += chunk })
    proc.stderr.on('data', callback !== undefined ? (chunk) => callback(chunk.toString()) : (chunk) => { console.warn(`[${pathspec}]: ${chunk.toString()}`) })
    proc.on('close', (code) => {
      try {
        const stdout_parsed = JSON.parse(stdout)
        if (stdout_parsed.error) reject(new ProcessError(stdout_parsed.error, code))
        else if (code !== 0) reject(new ProcessError(`[${pathspec}]: Process exited with unexpected code ${code}`, code))
        else resolve(stdout_parsed.data)
      } catch (e) {
        console.debug(stdout)
        reject(new ProcessError(`[${pathspec}]: Process output could not be parsed as json. ${e}`, code))
      }
    })
    proc.stdin.end(stdin)
  })
}

export function pythonStream(pathspec, args) {
  let stdin
  try {
    stdin = JSON.stringify(args)
  } catch (e) {
    throw new ProcessError(`Process input could not be serialized`, null)
  }
  const proc = spawn(pythonCommand, [
    '-u',
    path.join(process.env.PYTHON_ROOT || '', 'src', 'utils', 'helper.py'),
    pathspec,
  ], { env: { ...process.env } })
  let stderr = ''
  proc.stderr.on('data', (chunk) => { stderr += chunk })
  proc.on('close', (code) => {
    if (code !== 0) {
      console.error(new ProcessError(`[${pathspec}]: ${stderr || `Process exited with unexpected code ${code}`}`, code))
    } else if (stderr) {
      console.warn(`[${pathspec}]: ${stderr}`)
    }
  })
  proc.stdin.end(stdin)
  return proc.stdout
}
