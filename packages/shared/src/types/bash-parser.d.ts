declare module 'bash-parser' {
  interface ASTNode {
    type: string
    text?: string
    name?: string
    suffix?: ASTNode[]
    commands?: ASTNode[]
    list?: ASTNode[]
    parts?: ASTNode[]
    expansion?: string
    word?: string
    [key: string]: unknown
  }

  interface ParseOptions {
    mode?: 'bash' | 'posix'
    insertLOC?: boolean
    resolveEnv?: (name: string) => string | undefined
  }

  function parse(code: string, options?: ParseOptions): ASTNode

  export = parse
}
