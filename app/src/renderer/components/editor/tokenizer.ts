import { monaco } from '../../lib/monaco-setup'

export function registerSqlTokenizer(): void {
  monaco.languages.setMonarchTokensProvider('sql', {
    defaultToken: 'identifier',
    ignoreCase: true,
    tokenPostfix: '.sql',

    keywords: [
      'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'AS', 'ON',
      'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'NATURAL',
      'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
      'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'VIEW', 'TRIGGER', 'FUNCTION',
      'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'HAVING', 'LIMIT', 'OFFSET',
      'UNION', 'ALL', 'INTERSECT', 'EXCEPT', 'DISTINCT',
      'WITH', 'RECURSIVE', 'RETURNING', 'LATERAL',
      'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'SAVEPOINT',
      'GRANT', 'REVOKE', 'IF', 'ELSE', 'THEN', 'END',
      'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'DEFAULT',
      'CONSTRAINT', 'CASCADE', 'RESTRICT', 'NO', 'ACTION',
      'SCHEMA', 'DATABASE', 'USING', 'OVER', 'PARTITION', 'WINDOW',
      'FETCH', 'NEXT', 'ROWS', 'ONLY', 'FIRST', 'LAST',
      'FOR', 'SHARE', 'NOWAIT', 'SKIP', 'LOCKED',
      'EXPLAIN', 'ANALYZE', 'VERBOSE', 'FORMAT',
      'LIKE', 'ILIKE', 'SIMILAR', 'TO',
      'PERFORM', 'RAISE', 'EXCEPTION', 'NOTICE',
      'DECLARE', 'CURSOR', 'OPEN', 'CLOSE',
    ],

    operators: [
      'IN', 'EXISTS', 'BETWEEN', 'IS', 'NOT', 'NULL', 'TRUE', 'FALSE',
      'AND', 'OR', 'ANY', 'SOME',
    ],

    builtinFunctions: [
      'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF',
      'CASE', 'WHEN', 'CAST', 'CONVERT',
      'NOW', 'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME',
      'EXTRACT', 'DATE_TRUNC', 'DATE_PART', 'AGE', 'INTERVAL',
      'LENGTH', 'LOWER', 'UPPER', 'TRIM', 'SUBSTRING', 'REPLACE', 'CONCAT',
      'SPLIT_PART', 'REGEXP_REPLACE', 'REGEXP_MATCHES',
      'ARRAY_AGG', 'STRING_AGG', 'JSON_AGG', 'JSONB_AGG',
      'JSON_BUILD_OBJECT', 'JSONB_BUILD_OBJECT', 'ROW_NUMBER', 'RANK', 'DENSE_RANK',
      'LEAD', 'LAG', 'FIRST_VALUE', 'LAST_VALUE', 'NTH_VALUE',
      'GENERATE_SERIES', 'UNNEST',
      'TO_CHAR', 'TO_DATE', 'TO_NUMBER', 'TO_TIMESTAMP',
      'PG_TYPEOF', 'PG_SIZE_PRETTY',
      'GREATEST', 'LEAST', 'ABS', 'CEIL', 'FLOOR', 'ROUND', 'TRUNC',
      'RANDOM', 'MD5', 'GEN_RANDOM_UUID',
    ],

    typeKeywords: [
      'TEXT', 'VARCHAR', 'CHAR', 'CHARACTER', 'VARYING',
      'INTEGER', 'INT', 'INT2', 'INT4', 'INT8', 'SMALLINT', 'BIGINT',
      'SERIAL', 'BIGSERIAL', 'SMALLSERIAL',
      'BOOLEAN', 'BOOL',
      'REAL', 'FLOAT', 'FLOAT4', 'FLOAT8', 'DOUBLE', 'PRECISION', 'NUMERIC', 'DECIMAL',
      'TIMESTAMP', 'TIMESTAMPTZ', 'DATE', 'TIME', 'TIMETZ', 'INTERVAL',
      'UUID', 'JSON', 'JSONB', 'BYTEA', 'XML',
      'ARRAY', 'RECORD', 'VOID', 'OID', 'REGCLASS',
      'INET', 'CIDR', 'MACADDR', 'POINT', 'LINE', 'CIRCLE', 'BOX', 'PATH', 'POLYGON',
      'TSVECTOR', 'TSQUERY',
    ],

    tokenizer: {
      root: [
        // Bind variables :name
        [/:[a-zA-Z_]\w*/, 'variable'],
        // $N positional params
        [/\$\d+/, 'variable'],

        // Strings
        [/'/, 'string', '@string'],
        // Dollar-quoted strings (PostgreSQL)
        [/\$\w*\$/, 'string', '@dollarString'],

        // Numbers
        [/\d+\.\d*([eE][-+]?\d+)?/, 'number.float'],
        [/\.\d+([eE][-+]?\d+)?/, 'number.float'],
        [/\d+[eE][-+]?\d+/, 'number.float'],
        [/0[xX][0-9a-fA-F]+/, 'number.hex'],
        [/\d+/, 'number'],

        // Comments
        [/--.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],

        // Double-quoted identifiers
        [/"/, 'identifier.quote', '@quotedIdentifier'],

        // Operators
        [/[<>=!]+/, 'operator'],
        [/[+\-*/%&|^~]/, 'operator'],
        [/::/, 'operator'], // PostgreSQL type cast
        [/\|\|/, 'operator'], // String concat
        [/->|#>|@>|<@|&&|\?\?/, 'operator'], // JSON operators

        // Identifiers and keywords
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@builtinFunctions': 'predefined',
            '@typeKeywords': 'type',
            '@operators': 'operator.sql',
            '@keywords': 'keyword',
            '@default': 'identifier',
          }
        }],

        // Punctuation
        [/[;,.()\[\]{}]/, 'delimiter'],
      ],

      string: [
        [/[^']+/, 'string'],
        [/''/, 'string.escape'],
        [/'/, 'string', '@pop'],
      ],

      dollarString: [
        [/\$\w*\$/, 'string', '@pop'],
        [/./, 'string'],
      ],

      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment'],
      ],

      quotedIdentifier: [
        [/[^"]+/, 'identifier.quote'],
        [/""/, 'identifier.quote'],
        [/"/, 'identifier.quote', '@pop'],
      ],
    },
  })
}
